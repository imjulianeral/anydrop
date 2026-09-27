defmodule AnyshareWeb.AuthControllerTest do
  use AnyshareWeb.ConnCase, async: true
  alias Anyshare.Auth
  alias Anyshare.Auth.Token
  alias Anyshare.PasskeyFixture, as: Key
  alias Anyshare.Repo

  setup do
    Plug.CSRFProtection.delete_csrf_token()

    {:ok, user, :created} =
      Auth.google_sign_up(%{
        "sub" => Ecto.UUID.generate(),
        "email" => "person@example.com",
        "email_verified" => true
      })

    conn = get(build_conn(), "/auth/session")
    %{user: user, browser: conn, csrf: json_response(conn, 200)["csrf_token"]}
  end

  test "guests get CSRF protection without an account cookie token", %{browser: conn} do
    body = json_response(conn, 200)
    assert body["user"] == nil
    assert is_binary(body["csrf_token"])
    assert get_resp_header(conn, "cache-control") == ["no-store"]
    assert conn.resp_cookies["_anyshare_account"].http_only
    assert conn.resp_cookies["_anyshare_account"].same_site == "Lax"
  end

  test "rejects foreign origins, missing CSRF tokens, and anonymous enrollment", %{
    browser: conn,
    csrf: csrf
  } do
    foreign =
      conn
      |> recycle()
      |> put_req_header("origin", "https://attacker.example")
      |> put_req_header("x-csrf-token", csrf)

    assert foreign |> post("/auth/passkeys/authentication/options", %{}) |> response(403)

    missing =
      conn
      |> recycle()
      |> put_private(:plug_skip_csrf_protection, false)
      |> put_req_header("origin", Auth.origin())

    assert_error_sent 403, fn -> post(missing, "/auth/passkeys/authentication/options", %{}) end
    assert request(conn, csrf, :post, "/auth/passkeys/registration/options") |> json_response(401)
    assert request(conn, csrf, :delete, "/auth/passkeys/unknown") |> json_response(401)
  end

  test "callback requires a challenge bound to this browser", %{browser: conn} do
    result = conn |> recycle() |> get("/auth/google/callback?code=untrusted&state=untrusted")
    assert redirected_to(result) == Auth.origin() <> "/"
    refute get_session(result, :account_token)
    result = result |> recycle() |> get("/auth/session")
    assert json_response(result, 200)["error"] =~ "Google sign-in failed"
  end

  test "a challenge from another browser cannot authenticate", %{
    browser: conn,
    csrf: csrf,
    user: user
  } do
    key = enroll(user)
    options_conn = request(conn, csrf, :post, "/auth/passkeys/authentication/options")
    challenge = challenge(options_conn)
    payload = Key.assertion(key, user, challenge)
    stranger = get(build_conn(), "/auth/session")
    stranger_csrf = json_response(stranger, 200)["csrf_token"]

    assert request(stranger, stranger_csrf, :post, "/auth/passkeys/authentication", payload)
           |> json_response(422)
  end

  test "passkey sign-in rotates sessions, blocks replay, and logout revokes cookies", %{
    browser: conn,
    csrf: csrf,
    user: user
  } do
    key = enroll(user)
    options_conn = request(conn, csrf, :post, "/auth/passkeys/authentication/options")
    payload = Key.assertion(key, user, challenge(options_conn))
    signed_in = request(options_conn, csrf, :post, "/auth/passkeys/authentication", payload)
    assert json_response(signed_in, 200) == %{"ok" => true}
    token = get_session(signed_in, :account_token)
    assert {^user, _} = Auth.session(token)

    assert request(options_conn, csrf, :post, "/auth/passkeys/authentication", payload)
           |> json_response(422)

    session_conn = signed_in |> recycle() |> get("/auth/session")
    body = json_response(session_conn, 200)
    assert body["user"]["id"] == user.id
    refute Map.has_key?(body["user"], "google_sub")
    assert request(session_conn, body["csrf_token"], :post, "/auth/logout") |> json_response(200)
    refute Auth.session(token)

    assert signed_in
           |> recycle()
           |> get("/auth/session")
           |> json_response(200)
           |> Map.fetch!("user") == nil
  end

  test "enrollment binds the current user and requires a recent sign-in", %{user: user} do
    token = Auth.issue_token("session", user.id)
    conn = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    csrf = json_response(conn, 200)["csrf_token"]
    options_conn = request(conn, csrf, :post, "/auth/passkeys/registration/options")
    assert json_response(options_conn, 200)["user"]["name"] == user.email
    key = Key.key()
    payload = Key.registration(key, challenge(options_conn).challenge)

    assert %{"passkey" => %{"name" => "Passkey"}} =
             request(options_conn, csrf, :post, "/auth/passkeys/registration", payload)
             |> json_response(200)

    assert request(options_conn, csrf, :post, "/auth/passkeys/registration", payload)
           |> json_response(422)

    Repo.update_all(Token, set: [authenticated_at: DateTime.add(DateTime.utc_now(), -601)])

    assert %{"code" => "reauth_required"} =
             request(conn, csrf, :post, "/auth/passkeys/registration/options")
             |> json_response(403)
  end

  test "step-up with the account's own passkey unlocks sensitive changes", %{user: user} do
    key = enroll(user)
    token = Auth.issue_token("session", user.id)
    Repo.update_all(Token, set: [authenticated_at: DateTime.add(DateTime.utc_now(), -601)])
    conn = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    body = json_response(conn, 200)
    csrf = body["csrf_token"]
    [passkey] = body["user"]["passkeys"]

    assert %{"code" => "reauth_required"} =
             request(conn, csrf, :delete, "/auth/passkeys/#{passkey["id"]}")
             |> json_response(403)

    options_conn = request(conn, csrf, :post, "/auth/passkeys/reauthentication/options")
    assert [%{"id" => id}] = json_response(options_conn, 200)["allowCredentials"]
    assert id == passkey["id"]
    payload = Key.assertion(key, user, challenge(options_conn))

    assert request(options_conn, csrf, :post, "/auth/passkeys/reauthentication", payload)
           |> json_response(200)

    assert request(conn, csrf, :patch, "/auth/passkeys/#{id}", %{"name" => "Desk key"})
           |> json_response(200)
           |> get_in(["passkey", "name"]) == "Desk key"

    assert request(conn, csrf, :delete, "/auth/google") |> json_response(200)

    assert %{"code" => "last_sign_in_method"} =
             request(conn, csrf, :delete, "/auth/passkeys/#{id}") |> json_response(409)
  end

  test "unknown passkeys report their id so the browser can forget them", %{
    browser: conn,
    csrf: csrf,
    user: user
  } do
    options_conn = request(conn, csrf, :post, "/auth/passkeys/authentication/options")
    key = Key.key()
    payload = Key.assertion(key, user, challenge(options_conn))

    assert %{"code" => "unknown_credential", "credential_id" => credential_id} =
             request(options_conn, csrf, :post, "/auth/passkeys/authentication", payload)
             |> json_response(422)

    assert credential_id == payload["id"]
  end

  test "profile updates and account deletion", %{user: user} do
    token = Auth.issue_token("session", user.id)
    conn = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    csrf = json_response(conn, 200)["csrf_token"]

    assert request(conn, csrf, :patch, "/auth/profile", %{"name" => "  "}) |> json_response(422)

    assert request(conn, csrf, :patch, "/auth/profile", %{"name" => "Grace"})
           |> json_response(200)

    assert Repo.reload!(user).name == "Grace"

    deleted = request(conn, csrf, :delete, "/auth/account")
    assert json_response(deleted, 200) == %{"ok" => true}
    refute Repo.reload(user)
    refute Auth.session(token)
  end

  test "linking Google needs a signed-in, recently verified session", %{
    browser: conn,
    csrf: csrf,
    user: user
  } do
    assert %{"code" => "unauthenticated"} =
             request(conn, csrf, :post, "/auth/google", %{"intent" => "link"})
             |> json_response(401)

    assert request(conn, csrf, :post, "/auth/google", %{"intent" => "hijack"})
           |> json_response(422)

    token = Auth.issue_token("session", user.id)
    Repo.update_all(Token, set: [authenticated_at: DateTime.add(DateTime.utc_now(), -601)])
    signed_in = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    signed_in_csrf = json_response(signed_in, 200)["csrf_token"]

    assert %{"code" => "reauth_required"} =
             request(signed_in, signed_in_csrf, :post, "/auth/google", %{"intent" => "link"})
             |> json_response(403)
  end

  test "creates a passkey-only account from a name and signs it in", %{
    browser: conn,
    csrf: csrf
  } do
    options_conn =
      request(conn, csrf, :post, "/auth/passkeys/signup/options", %{
        "name" => "  Ada  ",
        "authenticator" => "security_key"
      })

    options = json_response(options_conn, 200)
    assert options["user"]["name"] == "Ada"
    assert options["hints"] == ["security-key"]
    assert options["authenticatorSelection"]["authenticatorAttachment"] == "cross-platform"

    %{challenge: challenge, user_id: user_id} = challenge(options_conn)
    key = Key.key()
    payload = Key.registration(key, challenge)
    signed_up = request(options_conn, csrf, :post, "/auth/passkeys/signup", payload)
    assert json_response(signed_up, 200) == %{"ok" => true}

    body = signed_up |> recycle() |> get("/auth/session") |> json_response(200)
    assert %{"id" => ^user_id, "name" => "Ada", "email" => nil} = body["user"]
    assert length(body["user"]["passkeys"]) == 1

    assert request(options_conn, csrf, :post, "/auth/passkeys/signup", payload)
           |> json_response(422)

    login_conn =
      request(conn, csrf, :post, "/auth/passkeys/authentication/options", %{
        "authenticator" => "app"
      })

    assert json_response(login_conn, 200)["hints"] == ["client-device", "hybrid"]
    assertion = Key.assertion(key, %{id: user_id}, challenge(login_conn))

    assert request(login_conn, csrf, :post, "/auth/passkeys/authentication", assertion)
           |> json_response(200)
  end

  test "a failed passkey sign-up leaves no account behind", %{browser: conn, csrf: csrf} do
    options_conn =
      request(conn, csrf, :post, "/auth/passkeys/signup/options", %{"name" => "Ada"})

    %{challenge: challenge} = challenge(options_conn)
    payload = Key.registration(Key.key(), challenge, origin: "https://attacker.example")

    assert request(options_conn, csrf, :post, "/auth/passkeys/signup", payload)
           |> json_response(422)

    assert Repo.aggregate(Anyshare.Auth.User, :count) == 1
  end

  test "sign-up rejects blank names and unknown authenticators", %{browser: conn, csrf: csrf} do
    assert request(conn, csrf, :post, "/auth/passkeys/signup/options", %{"name" => "   "})
           |> json_response(422)

    assert request(conn, csrf, :post, "/auth/passkeys/signup/options", %{
             "name" => "Ada",
             "authenticator" => "sms"
           })
           |> json_response(422)

    assert request(conn, csrf, :post, "/auth/passkeys/authentication/options", %{
             "authenticator" => "sms"
           })
           |> json_response(422)
  end

  defp enroll(user) do
    key = Key.key()
    {challenge, _} = Auth.registration_options(user)
    {:ok, _} = Auth.register(user, Key.registration(key, challenge), challenge)
    key
  end

  defp challenge(conn) do
    token = Repo.get!(Token, Anyshare.Accounts.digest(get_session(conn, :auth_challenge)))
    :erlang.binary_to_term(token.data, [:safe])
  end

  defp request(conn, csrf, method, path, body \\ %{}) do
    conn =
      conn
      |> recycle()
      |> put_private(:plug_skip_csrf_protection, false)
      |> put_req_header("origin", Auth.origin())
      |> put_req_header("x-csrf-token", csrf)

    dispatch(conn, @endpoint, method, path, body)
  end
end
