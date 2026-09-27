defmodule AnyshareWeb.AuthController do
  use AnyshareWeb, :controller
  alias Anyshare.Auth

  plug :require_session
       when action in [
              :update_profile,
              :rename_passkey,
              :reauthentication_options,
              :reauthenticate,
              :register
            ]

  plug :require_session,
       [recent: true]
       when action in [:registration_options, :delete_passkey, :unlink_google, :delete_account]

  def show(conn, _params) do
    session = Auth.session(get_session(conn, :account_token))

    conn
    |> delete_session(:auth_error)
    |> delete_session(:auth_notice)
    |> delete_session(:auth_error_code)
    |> json(%{
      user: user_json(session),
      rp_id: Auth.rp_id(),
      csrf_token: get_csrf_token(),
      google_enabled: Auth.google_enabled?(),
      error: get_session(conn, :auth_error),
      error_code: get_session(conn, :auth_error_code),
      notice: get_session(conn, :auth_notice)
    })
  end

  # Google

  def google(conn, params) do
    with {:ok, intent} <- Auth.google_intent(params["intent"]),
         {:ok, user_id} <- google_owner(conn, intent),
         true <- Auth.google_enabled?(),
         {:ok, %{url: url, session_params: session_params}} <-
           Assent.Strategy.Google.authorize_url(Auth.google_config(intent)) do
      conn
      |> store_challenge("google", user_id, %{intent: intent, session_params: session_params})
      |> json(%{url: url})
    else
      {:error, %Plug.Conn{} = conn} ->
        conn

      {:error, :invalid_intent} ->
        error(conn, :unprocessable_entity, "Unknown Google sign-in request.")

      _ ->
        error(
          conn,
          :service_unavailable,
          "Google sign-in is not configured or is temporarily unavailable."
        )
    end
  end

  def callback(conn, params) do
    challenge = get_session(conn, :auth_challenge)
    conn = delete_session(conn, :auth_challenge)

    with {:ok, user_id, %{intent: intent, session_params: session_params}} <-
           Auth.consume(challenge, "google"),
         config = Keyword.put(Auth.google_config(intent), :session_params, session_params),
         {:ok, %{user: claims}} <- Assent.Strategy.Google.callback(config, params) do
      finish_google(conn, intent, user_id, claims)
    else
      _ -> google_result(conn, :auth_error, "Google sign-in failed. Please try again.")
    end
  end

  def unlink_google(conn, _params) do
    case Auth.unlink_google(conn.assigns.current_user) do
      {:ok, _} -> json(conn, %{ok: true})
      {:error, :last_sign_in_method} -> last_sign_in_method(conn)
      {:error, _} -> error(conn, :not_found, "No Google account is connected.")
    end
  end

  # Session and profile

  def logout(conn, _params) do
    Auth.revoke(get_session(conn, :account_token))
    Auth.revoke(get_session(conn, :auth_challenge))
    delete_csrf_token()
    conn |> clear_session() |> configure_session(drop: true) |> json(%{ok: true})
  end

  def update_profile(conn, params) do
    case Auth.rename_user(conn.assigns.current_user, params["name"]) do
      {:ok, _user} -> json(conn, %{ok: true})
      {:error, _} -> invalid_name(conn)
    end
  end

  def delete_account(conn, _params) do
    {:ok, _} = Auth.delete_user(conn.assigns.current_user)
    Auth.revoke(get_session(conn, :auth_challenge))
    delete_csrf_token()
    conn |> clear_session() |> configure_session(drop: true) |> json(%{ok: true})
  end

  # Passkey sign-up and sign-in

  def signup_options(conn, params) do
    with {:ok, name} <- Auth.normalize_name(params["name"]),
         {:ok, authenticator} <- Auth.authenticator(params["authenticator"]) do
      {data, options} = Auth.signup_options(name, authenticator)
      conn |> store_challenge("signup", nil, data) |> json(options)
    else
      {:error, :invalid_name} -> invalid_name(conn)
      {:error, _} -> invalid_authenticator(conn)
    end
  end

  def signup(conn, params) do
    token = get_session(conn, :auth_challenge)
    conn = delete_session(conn, :auth_challenge)

    with {:ok, nil, data} <- Auth.consume(token, "signup"),
         {:ok, user} <- Auth.sign_up(params, data) do
      conn |> sign_in(user) |> json(%{ok: true})
    else
      _ -> invalid_passkey(conn)
    end
  end

  def authentication_options(conn, params) do
    case Auth.authenticator(params["authenticator"]) do
      {:ok, authenticator} ->
        {challenge, options} = Auth.authentication_options(authenticator)
        conn |> store_challenge("authenticate", nil, challenge) |> json(options)

      {:error, _} ->
        invalid_authenticator(conn)
    end
  end

  def authenticate(conn, params) do
    token = get_session(conn, :auth_challenge)
    conn = delete_session(conn, :auth_challenge)

    with {:ok, nil, challenge} <- Auth.consume(token, "authenticate"),
         {:ok, user} <- Auth.authenticate(params, challenge) do
      conn |> sign_in(user) |> json(%{ok: true})
    else
      {:error, :unknown_credential} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{
          error: "No account uses this passkey. Create an account first.",
          code: "unknown_credential",
          credential_id: params["id"]
        })

      _ ->
        invalid_passkey(conn)
    end
  end

  # Step-up verification

  def reauthentication_options(conn, _params) do
    user = conn.assigns.current_user

    case Auth.reauthentication_options(user) do
      {:ok, challenge, options} ->
        conn |> store_challenge("reauthenticate", user.id, challenge) |> json(options)

      {:error, :no_passkeys} ->
        error(conn, :conflict, "This account has no passkeys yet.", "no_passkeys")
    end
  end

  def reauthenticate(conn, params) do
    user = conn.assigns.current_user
    token = get_session(conn, :auth_challenge)
    conn = delete_session(conn, :auth_challenge)

    with {:ok, user_id, challenge} when user_id == user.id <-
           Auth.consume(token, "reauthenticate"),
         :ok <- Auth.reauthenticate(user, params, challenge) do
      Auth.mark_authenticated(get_session(conn, :account_token))
      json(conn, %{ok: true})
    else
      _ -> invalid_passkey(conn)
    end
  end

  # Passkey management

  def registration_options(conn, params) do
    user = conn.assigns.current_user

    case Auth.authenticator(params["authenticator"]) do
      {:ok, authenticator} ->
        {challenge, options} = Auth.registration_options(user, authenticator)

        conn
        |> store_challenge("register", user.id, %{
          challenge: challenge,
          authenticator: authenticator
        })
        |> json(options)

      {:error, _} ->
        invalid_authenticator(conn)
    end
  end

  def register(conn, params) do
    user = conn.assigns.current_user
    token = get_session(conn, :auth_challenge)
    conn = delete_session(conn, :auth_challenge)

    with {:ok, user_id, %{challenge: challenge, authenticator: authenticator}}
         when user_id == user.id <- Auth.consume(token, "register"),
         {:ok, passkey} <- Auth.register(user, params, challenge, authenticator) do
      json(conn, %{ok: true, passkey: passkey_json(passkey)})
    else
      _ -> invalid_passkey(conn)
    end
  end

  def rename_passkey(conn, %{"id" => id} = params) do
    case Auth.rename_passkey(conn.assigns.current_user, id, params["name"]) do
      {:ok, passkey} -> json(conn, %{ok: true, passkey: passkey_json(passkey)})
      {:error, :not_found} -> error(conn, :not_found, "Passkey not found.")
      {:error, _} -> invalid_name(conn)
    end
  end

  def delete_passkey(conn, %{"id" => id}) do
    case Auth.delete_passkey(conn.assigns.current_user, id) do
      {:ok, _} -> json(conn, %{ok: true})
      {:error, :last_sign_in_method} -> last_sign_in_method(conn)
      {:error, _} -> error(conn, :not_found, "Passkey not found.")
    end
  end

  # Helpers

  defp finish_google(conn, :sign_in, nil, claims) do
    case Auth.google_sign_in(claims) do
      {:ok, user} ->
        conn = sign_in(conn, user)

        if Auth.passkeys(user) == [],
          do: google_result(conn, :auth_notice, "Signed in with Google."),
          else: redirect(conn, external: Auth.origin() <> "/")

      {:error, :account_not_found} ->
        conn
        |> put_session(:auth_error_code, "account_not_found")
        |> google_result(
          :auth_error,
          "No account uses this Google account yet. Create an account first."
        )

      _ ->
        google_result(conn, :auth_error, "Google sign-in failed. Please try again.")
    end
  end

  defp finish_google(conn, :sign_up, nil, claims) do
    case Auth.google_sign_up(claims) do
      {:ok, user, :created} ->
        conn |> sign_in(user) |> google_result(:auth_notice, "Account created with Google.")

      {:ok, user, :existing} ->
        conn
        |> sign_in(user)
        |> google_result(:auth_notice, "You already have an account, so we signed you in.")

      _ ->
        google_result(conn, :auth_error, "Google sign-up failed. Please try again.")
    end
  end

  defp finish_google(conn, intent, user_id, claims) do
    case Auth.session(get_session(conn, :account_token)) do
      {%{id: ^user_id} = user, _authenticated_at} -> finish_google_for(conn, intent, user, claims)
      _ -> google_result(conn, :auth_error, "Your session ended. Sign in again.")
    end
  end

  defp finish_google_for(conn, :link, user, claims) do
    case Auth.link_google(user, claims) do
      {:ok, _identity} ->
        Auth.mark_authenticated(get_session(conn, :account_token))
        google_result(conn, :auth_notice, "Google account connected.")

      {:error, :identity_taken} ->
        google_result(
          conn,
          :auth_error,
          "That Google account already belongs to another AnyShare account."
        )

      {:error, :already_linked} ->
        google_result(conn, :auth_error, "A different Google account is already connected.")

      {:error, _} ->
        google_result(conn, :auth_error, "Google sign-in failed. Please try again.")
    end
  end

  defp finish_google_for(conn, :reauth, user, claims) do
    if Auth.google_matches?(user, claims) do
      Auth.mark_authenticated(get_session(conn, :account_token))
      google_result(conn, :auth_notice, "Identity confirmed. You can continue.")
    else
      google_result(
        conn,
        :auth_error,
        "Use the Google account that is connected to AnyShare."
      )
    end
  end

  defp google_result(conn, key, message),
    do: conn |> put_session(key, message) |> redirect(external: Auth.origin() <> "/")

  defp google_owner(_conn, intent) when intent in [:sign_in, :sign_up], do: {:ok, nil}

  defp google_owner(conn, intent) do
    case Auth.session(get_session(conn, :account_token)) do
      {user, authenticated_at} ->
        if intent == :reauth or Auth.recently_authenticated?(authenticated_at),
          do: {:ok, user.id},
          else: {:error, reauth_required(conn)}

      nil ->
        {:error, error(conn, :unauthorized, "Sign in first.", "unauthenticated")}
    end
  end

  defp sign_in(conn, user) do
    Auth.revoke(get_session(conn, :account_token))
    Auth.revoke(get_session(conn, :auth_challenge))
    delete_csrf_token()

    conn
    |> clear_session()
    |> configure_session(renew: true)
    |> put_session(:account_token, Auth.issue_token("session", user.id))
  end

  defp store_challenge(conn, kind, user_id, challenge) do
    Auth.revoke(get_session(conn, :auth_challenge))
    put_session(conn, :auth_challenge, Auth.issue_token(kind, user_id, challenge))
  end

  defp require_session(conn, options) do
    case Auth.session(get_session(conn, :account_token)) do
      {user, authenticated_at} ->
        if options[:recent] && not Auth.recently_authenticated?(authenticated_at) do
          conn |> reauth_required() |> halt()
        else
          assign(conn, :current_user, user)
        end

      nil ->
        conn |> error(:unauthorized, "Sign in first.", "unauthenticated") |> halt()
    end
  end

  defp error(conn, status, message, code \\ nil) do
    body = if code, do: %{error: message, code: code}, else: %{error: message}
    conn |> put_status(status) |> json(body)
  end

  defp reauth_required(conn),
    do: error(conn, :forbidden, "Confirm it's you to continue.", "reauth_required")

  defp last_sign_in_method(conn),
    do:
      error(
        conn,
        :conflict,
        "Add another way to sign in before removing this one.",
        "last_sign_in_method"
      )

  defp invalid_passkey(conn),
    do:
      error(
        conn,
        :unprocessable_entity,
        "Passkey verification failed or expired. Please try again."
      )

  defp invalid_name(conn),
    do: error(conn, :unprocessable_entity, "Enter a name between 1 and 80 characters.")

  defp invalid_authenticator(conn),
    do: error(conn, :unprocessable_entity, "Choose a passkey app or a security key.")

  defp user_json(nil), do: nil

  defp user_json({user, authenticated_at}) do
    google = Auth.google_identity(user)

    %{
      id: user.id,
      name: user.name,
      email: user.email,
      webauthn_id: Base.url_encode64(user.id, padding: false),
      google: if(google, do: %{email: google.email, picture: google.picture}),
      passkeys: Enum.map(Auth.passkeys(user), &passkey_json/1),
      reauth_until: Auth.reauth_until(authenticated_at)
    }
  end

  defp passkey_json(passkey),
    do: %{
      id: passkey.id,
      name: passkey.name,
      backed_up: passkey.backed_up,
      transports: passkey.transports,
      created_at: passkey.inserted_at,
      last_used_at: passkey.last_used_at
    }
end
