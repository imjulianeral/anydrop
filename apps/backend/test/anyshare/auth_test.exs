defmodule Anyshare.AuthTest do
  use Anyshare.DataCase, async: true
  alias Anyshare.Auth
  alias Anyshare.Auth.{Identity, Passkey, Token}
  alias Anyshare.PasskeyFixture, as: Key

  setup do
    {:ok, user, :created} =
      Auth.google_sign_up(%{
        "sub" => Ecto.UUID.generate(),
        "email" => "person@example.com",
        "email_verified" => true
      })

    %{user: user, key: Key.key()}
  end

  test "Google authorization preserves a random nonce through ID token validation" do
    config = google_config()
    {:ok, %{url: url, session_params: params}} = Assent.Strategy.Google.authorize_url(config)
    nonce = url |> URI.parse() |> Map.fetch!(:query) |> URI.decode_query() |> Map.fetch!("nonce")
    token = Auth.issue_token("google", nil, params)
    {:ok, nil, params} = Auth.consume(token, "google")
    config = Keyword.put(config, :session_params, params)

    assert {:ok, %{verified?: true}} =
             Assent.Strategy.OIDC.validate_id_token(config, google_id_token(config, nonce))

    assert params.nonce == nonce
    assert byte_size(nonce) >= 32
    refute nonce == google_config()[:nonce]
    assert {:error, :expired_challenge} = Auth.consume(token, "google")
  end

  test "Google ID token validation rejects a nonce from another sign-in" do
    config = google_config()
    {:ok, %{session_params: params}} = Assent.Strategy.Google.authorize_url(config)
    config = Keyword.put(config, :session_params, params)

    assert {:error, _} =
             Assent.Strategy.OIDC.validate_id_token(
               config,
               google_id_token(config, Anyshare.Accounts.issue_token())
             )
  end

  test "Google identity uses subject, never automatic email linking", %{user: user} do
    subject = Auth.google_identity(user).subject

    {:ok, same} =
      Auth.google_sign_in(%{
        "sub" => subject,
        "email" => "updated@example.com",
        "email_verified" => true
      })

    stranger = %{"sub" => "other-subject", "email" => user.email, "email_verified" => true}
    assert {:error, :account_not_found} = Auth.google_sign_in(stranger)
    {:ok, other, :created} = Auth.google_sign_up(stranger)
    assert {:ok, again, :existing} = Auth.google_sign_up(stranger)

    assert same.id == user.id
    assert Auth.google_identity(user).email == "updated@example.com"
    refute other.id == user.id
    assert again.id == other.id

    assert {:error, _} =
             Auth.google_sign_in(%{
               "sub" => "unverified",
               "email" => user.email,
               "email_verified" => false
             })
  end

  test "keeps the Google profile photo only when Google hosts it", %{user: user} do
    assert is_nil(Auth.google_identity(user).picture)
    photo = "https://lh3.googleusercontent.com/a/photo=s96-c"
    subject = Auth.google_identity(user).subject
    claims = %{"sub" => subject, "email" => user.email, "email_verified" => true}

    {:ok, _} = Auth.google_sign_in(Map.put(claims, "picture", photo))
    assert Auth.google_identity(user).picture == photo

    for url <- [
          "http://lh3.googleusercontent.com/a/photo",
          "https://googleusercontent.com.example.com/a/photo",
          "javascript:alert(1)",
          42
        ] do
      {:ok, _} = Auth.google_sign_in(Map.put(claims, "picture", url))
      assert is_nil(Auth.google_identity(user).picture)
    end
  end

  test "links Google to a passkey-only account and refuses identities owned elsewhere", %{
    user: user,
    key: key
  } do
    {data, _} = Auth.signup_options("Ada", :app)
    {:ok, ada} = Auth.sign_up(Key.registration(key, data.challenge), data)
    assert is_nil(ada.email)

    taken = %{
      "sub" => Auth.google_identity(user).subject,
      "email" => "x@example.com",
      "email_verified" => true
    }

    assert {:error, :identity_taken} = Auth.link_google(ada, taken)
    fresh = %{"sub" => "ada-google", "email" => "ada@example.com", "email_verified" => true}
    assert {:ok, %Identity{}} = Auth.link_google(ada, fresh)
    assert Repo.reload!(ada).email == "ada@example.com"
    assert Auth.google_matches?(ada, fresh)
    refute Auth.google_matches?(ada, taken)
    assert {:ok, %{id: ada_id}} = Auth.google_sign_in(fresh)
    assert ada_id == ada.id

    other = %{fresh | "sub" => "ada-other"}
    assert {:error, :already_linked} = Auth.link_google(ada, other)
  end

  test "never removes the last way to sign in", %{user: user, key: key} do
    assert {:error, :last_sign_in_method} = Auth.unlink_google(user)
    {challenge, _} = Auth.registration_options(user)
    {:ok, passkey} = Auth.register(user, Key.registration(key, challenge), challenge)
    assert {:ok, _} = Auth.unlink_google(user)
    assert {:error, :last_sign_in_method} = Auth.delete_passkey(user, passkey.id)
    assert {:error, :not_found} = Auth.delete_passkey(user, "missing")
    assert Repo.get(Passkey, passkey.id)
  end

  test "names passkeys from their provider and lets people rename them", %{user: user} do
    {challenge, _} = Auth.registration_options(user, :security_key)

    {:ok, key} =
      Auth.register(user, Key.registration(Key.key(), challenge), challenge, :security_key)

    assert key.name == "Security key"

    {challenge, _} = Auth.registration_options(user)

    icloud =
      Key.registration(Key.key(), challenge, aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd")

    {:ok, synced} = Auth.register(user, icloud, challenge)
    assert synced.name == "iCloud Keychain"
    assert synced.aaguid == "fbfc3007-154e-4ecc-8c0b-6e020557d7bd"

    assert {:ok, %{name: "Work laptop"}} = Auth.rename_passkey(user, synced.id, "  Work laptop ")
    assert {:error, :invalid_name} = Auth.rename_passkey(user, synced.id, " ")

    {:ok, other, :created} =
      Auth.google_sign_up(%{
        "sub" => "other",
        "email" => "o@example.com",
        "email_verified" => true
      })

    assert {:error, :not_found} = Auth.rename_passkey(other, synced.id, "Mine")
  end

  test "step-up only accepts the signed-in user's own passkeys", %{user: user, key: key} do
    assert {:error, :no_passkeys} = Auth.reauthentication_options(user)
    {challenge, _} = Auth.registration_options(user)
    {:ok, passkey} = Auth.register(user, Key.registration(key, challenge), challenge)
    {:ok, challenge, options} = Auth.reauthentication_options(user)
    assert [%{id: id}] = options.allowCredentials
    assert id == passkey.id

    {data, _} = Auth.signup_options("Mallory", :app)
    mallory_key = Key.key()
    {:ok, mallory} = Auth.sign_up(Key.registration(mallory_key, data.challenge), data)

    assert {:error, _} =
             Auth.reauthenticate(user, Key.assertion(mallory_key, mallory, challenge), challenge)

    {:ok, challenge, _} = Auth.reauthentication_options(user)
    assert :ok = Auth.reauthenticate(user, Key.assertion(key, user, challenge), challenge)
    assert Repo.get!(Passkey, passkey.id).last_used_at
  end

  test "unknown passkeys are reported so the browser can forget them", %{user: user, key: key} do
    {challenge, _} = Auth.authentication_options()

    assert {:error, :unknown_credential} =
             Auth.authenticate(Key.assertion(key, user, challenge), challenge)
  end

  test "sessions expire, store a digest, and can be revoked", %{user: user} do
    token = Auth.issue_token("session", user.id)
    assert {^user, _} = Auth.session(token)
    refute Repo.get(Token, token)
    assert Repo.get(Token, Anyshare.Accounts.digest(token))
    Auth.revoke(token)
    refute Auth.session(token)
    token = Auth.issue_token("session", user.id)
    Repo.update_all(Token, set: [expires_at: DateTime.add(DateTime.utc_now(), -1)])
    refute Auth.session(token)
  end

  test "challenges expire, have a purpose, and can only be consumed once" do
    token = Auth.issue_token("google", nil, %{state: "expected"})
    assert {:error, _} = Auth.consume(token, "authenticate")
    assert {:ok, nil, %{state: "expected"}} = Auth.consume(token, "google")
    assert {:error, _} = Auth.consume(token, "google")
    token = Auth.issue_token("authenticate", nil, %{})
    Repo.update_all(Token, set: [expires_at: DateTime.add(DateTime.utc_now(), -1)])
    assert {:error, _} = Auth.consume(token, "authenticate")
  end

  test "registers and verifies a signed discoverable passkey", %{user: user, key: key} do
    {registration, options} = Auth.registration_options(user)
    assert options.authenticatorSelection.residentKey == "required"
    assert options.authenticatorSelection.userVerification == "required"
    assert {:ok, stored} = Auth.register(user, Key.registration(key, registration), registration)
    {challenge, _} = Auth.authentication_options()
    assert {:ok, ^user} = Auth.authenticate(Key.assertion(key, user, challenge), challenge)
    assert Repo.get!(Passkey, stored.id).sign_count == 1
    assert {:error, _} = Auth.authenticate(Key.assertion(key, user, challenge), challenge)
  end

  test "rejects duplicate enrollment and cross-account removal", %{user: user, key: key} do
    {challenge, _} = Auth.registration_options(user)
    payload = Key.registration(key, challenge)
    assert {:ok, stored} = Auth.register(user, payload, challenge)
    assert {:error, _} = Auth.register(user, payload, challenge)

    {:ok, other, :created} =
      Auth.google_sign_up(%{
        "sub" => "other",
        "email" => "other@example.com",
        "email_verified" => true
      })

    assert {:error, :not_found} = Auth.delete_passkey(other, stored.id)
    assert {:ok, _} = Auth.delete_passkey(user, stored.id)
    {challenge, _} = Auth.authentication_options()

    assert {:error, :unknown_credential} =
             Auth.authenticate(Key.assertion(key, user, challenge), challenge)
  end

  test "rejects registration without verification or from another origin", %{user: user, key: key} do
    {challenge, _} = Auth.registration_options(user)

    for options <- [[flags: 0x41], [origin: "https://attacker.example"], [cross_origin: true]] do
      assert {:error, _} =
               Auth.register(user, Key.registration(key, challenge, options), challenge)
    end
  end

  test "rejects wrong origin, RP, signature, user, challenge, and missing verification", %{
    user: user,
    key: key
  } do
    {registration, _} = Auth.registration_options(user)
    {:ok, _} = Auth.register(user, Key.registration(key, registration), registration)
    {challenge, _} = Auth.authentication_options()

    for options <- [[origin: "https://attacker.example"], [flags: 1], [rp_id: "attacker.example"]] do
      assert {:error, _} =
               Auth.authenticate(Key.assertion(key, user, challenge, options), challenge)
    end

    assert {:error, _} =
             Auth.authenticate(
               Key.assertion(key, %{id: Ecto.UUID.generate()}, challenge),
               challenge
             )

    {other_challenge, _} = Auth.authentication_options()
    assert {:error, _} = Auth.authenticate(Key.assertion(key, user, other_challenge), challenge)
    forged = Key.assertion(%{key | private: Key.key().private}, user, challenge)
    assert {:error, _} = Auth.authenticate(forged, challenge)
  end

  test "supports authenticators that do not increment counters", %{user: user, key: key} do
    {registration, _} = Auth.registration_options(user)
    {:ok, _} = Auth.register(user, Key.registration(key, registration), registration)

    for _ <- 1..2 do
      {challenge, _} = Auth.authentication_options()

      assert {:ok, ^user} =
               Auth.authenticate(Key.assertion(key, user, challenge, count: 0), challenge)
    end
  end

  test "malformed browser data fails without raising", %{user: user} do
    {registration, _} = Auth.registration_options(user)
    {authentication, _} = Auth.authentication_options()

    for params <- [
          %{},
          %{"type" => "public-key", "id" => "x", "response" => nil},
          %{
            "type" => "public-key",
            "id" => "x",
            "response" => %{"attestationObject" => "garbage", "clientDataJSON" => "e30"}
          }
        ] do
      assert {:error, _} = Auth.register(user, params, registration)
      assert {:error, _} = Auth.authenticate(params, authentication)
    end
  end

  defp google_config do
    Auth.google_config()
    |> Keyword.merge(
      client_id: "test-client",
      client_secret: "test-secret",
      id_token_signed_response_alg: "HS256",
      openid_configuration: %{
        "issuer" => "https://accounts.google.com",
        "authorization_endpoint" => "https://accounts.google.com/o/oauth2/v2/auth"
      }
    )
  end

  defp google_id_token(config, nonce) do
    now = System.system_time(:second)

    {:ok, token} =
      Assent.JWTAdapter.AssentJWT.sign(
        %{
          "iss" => "https://accounts.google.com",
          "sub" => "google-user",
          "aud" => config[:client_id],
          "iat" => now,
          "exp" => now + 300,
          "nonce" => nonce
        },
        "HS256",
        config[:client_secret],
        json_library: Jason
      )

    token
  end
end
