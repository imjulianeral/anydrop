defmodule Phemera.Auth do
  import Ecto.Query
  alias Phemera.Accounts
  alias Phemera.Auth.{Authenticators, Identity, Passkey, Token, User}
  alias Phemera.Repo

  @session_seconds 7 * 24 * 60 * 60
  @challenge_seconds 300
  @reauth_seconds 10 * 60
  @max_name_bytes 80
  @max_picture_bytes 2048
  @transports ~w(ble cable hybrid internal nfc smart-card usb)

  def origin, do: Application.fetch_env!(:phemera, :auth)[:origin]

  def rp_id, do: URI.parse(origin()).host

  # Google

  def google_enabled?,
    do:
      google_config()[:client_id] not in [nil, ""] and
        google_config()[:client_secret] not in [nil, ""]

  @doc """
  Google OpenID Connect settings. Everything except a plain sign-in shows the
  account chooser so the person confirms which Google account they mean.
  """
  def google_config(intent \\ :sign_in) do
    prompt = if intent == :sign_in, do: [], else: [prompt: "select_account"]

    Application.fetch_env!(:phemera, :auth)
    |> Keyword.take([:client_id, :client_secret])
    |> Keyword.merge(
      redirect_uri: origin() <> "/auth/google/callback",
      authorization_params: [scope: "email profile"] ++ prompt,
      code_verifier: true,
      nonce: Accounts.issue_token(),
      http_adapter: {Assent.HTTPAdapter.Httpc, [timeout: 10_000, connect_timeout: 5_000]}
    )
  end

  def google_intent("link"), do: {:ok, :link}
  def google_intent("reauth"), do: {:ok, :reauth}
  def google_intent("sign_up"), do: {:ok, :sign_up}
  def google_intent(intent) when intent in [nil, "sign_in"], do: {:ok, :sign_in}
  def google_intent(_intent), do: {:error, :invalid_intent}

  @doc """
  Signs in to the account that already uses this Google identity. Returns
  `{:error, :account_not_found}` when nobody has created one yet. The Google
  subject identifies the account; a matching email never merges accounts.
  """
  def google_sign_in(claims) do
    with {:ok, claims} <- verified_google(claims) do
      case Repo.get_by(Identity, provider: "google", subject: claims.subject) do
        nil -> {:error, :account_not_found}
        identity -> {:ok, refresh_identity!(identity, claims)}
      end
    end
  end

  @doc """
  Creates an account for a Google identity. If the identity already has an
  account, that account is returned as `{:ok, user, :existing}`.
  """
  def google_sign_up(claims) do
    with {:ok, claims} <- verified_google(claims) do
      Repo.transaction(fn ->
        case Repo.get_by(Identity, provider: "google", subject: claims.subject) do
          nil ->
            user = Repo.insert!(%User{name: claims.name, email: claims.email})
            insert_identity!(user, claims)
            {user, :created}

          identity ->
            {refresh_identity!(identity, claims), :existing}
        end
      end)
      |> case do
        {:ok, {user, status}} -> {:ok, user, status}
        error -> error
      end
    end
  end

  defp refresh_identity!(identity, claims) do
    identity
    |> Ecto.Changeset.change(email: claims.email, picture: claims.picture)
    |> Repo.update!()

    Repo.get!(User, identity.user_id)
  end

  @doc "Connects a Google account to an existing account, e.g. one created with a passkey."
  def link_google(user, claims) do
    with {:ok, claims} <- verified_google(claims) do
      Repo.transaction(fn ->
        lock_user!(user)

        case {google_identity(user),
              Repo.get_by(Identity, provider: "google", subject: claims.subject)} do
          {nil, nil} ->
            identity = insert_identity!(user, claims)

            if is_nil(user.email),
              do: user |> Ecto.Changeset.change(email: claims.email) |> Repo.update!()

            identity

          {%Identity{subject: subject} = identity, _} when subject == claims.subject ->
            identity

          {%Identity{}, _} ->
            Repo.rollback(:already_linked)

          {nil, %Identity{}} ->
            Repo.rollback(:identity_taken)
        end
      end)
    end
  end

  @doc "True when the verified Google claims belong to this user's linked Google account."
  def google_matches?(user, claims) do
    case {verified_google(claims), google_identity(user)} do
      {{:ok, %{subject: subject}}, %Identity{subject: subject}} -> true
      _ -> false
    end
  end

  def unlink_google(user) do
    Repo.transaction(fn ->
      lock_user!(user)

      cond do
        is_nil(google_identity(user)) -> Repo.rollback(:not_found)
        sign_in_method_count(user) <= 1 -> Repo.rollback(:last_sign_in_method)
        true -> Repo.delete_all(from i in Identity, where: i.user_id == ^user.id)
      end
    end)
  end

  def google_identity(user),
    do: Repo.one(from i in Identity, where: i.user_id == ^user.id and i.provider == "google")

  defp verified_google(%{"sub" => sub, "email" => email, "email_verified" => true} = claims)
       when is_binary(sub) and sub != "" and is_binary(email) and email != "" do
    name =
      case normalize_name(claims["name"]) do
        {:ok, name} -> name
        {:error, _} -> email |> String.split("@") |> hd() |> String.slice(0, @max_name_bytes)
      end

    {:ok, %{subject: sub, email: email, name: name, picture: google_picture(claims["picture"])}}
  end

  defp verified_google(_claims), do: {:error, :unverified_email}

  # Only keeps HTTPS photos served by Google, so the client never loads an
  # arbitrary URL from the claims.
  defp google_picture(url) when is_binary(url) and byte_size(url) <= @max_picture_bytes do
    case URI.parse(url) do
      %URI{scheme: "https", host: host} when is_binary(host) ->
        if String.ends_with?(host, ".googleusercontent.com"), do: url

      _ ->
        nil
    end
  end

  defp google_picture(_url), do: nil

  defp insert_identity!(user, claims),
    do:
      Repo.insert!(%Identity{
        user_id: user.id,
        provider: "google",
        subject: claims.subject,
        email: claims.email,
        picture: claims.picture
      })

  @doc """
  A path on this site to return to after Google sign-in, or nil. Only
  same-site paths pass, so a crafted link can't bounce people elsewhere.
  """
  def safe_return_to("/" <> rest = path) when byte_size(path) <= 512 do
    uri = URI.parse(path)

    if not String.starts_with?(rest, "/") and is_nil(uri.scheme) and is_nil(uri.host) and
         String.printable?(path) and not String.contains?(path, ["\\", "\n", "\r"]),
       do: path
  end

  def safe_return_to(_path), do: nil

  # Profile

  def normalize_name(name) when is_binary(name) do
    case String.trim(name) do
      "" -> {:error, :invalid_name}
      name when byte_size(name) > @max_name_bytes -> {:error, :invalid_name}
      name -> {:ok, name}
    end
  end

  def normalize_name(_name), do: {:error, :invalid_name}

  def rename_user(user, name) do
    with {:ok, name} <- normalize_name(name) do
      user |> Ecto.Changeset.change(name: name) |> Repo.update()
    end
  end

  @doc "Deletes the account with its identities, passkeys and sessions."
  def delete_user(user), do: Repo.delete(user)

  # Sessions and challenges

  def issue_token(kind, user_id \\ nil, data \\ nil) do
    now = DateTime.utc_now()
    Repo.delete_all(from t in Token, where: t.expires_at <= ^now)
    token = Accounts.issue_token()
    ttl = if kind == "session", do: @session_seconds, else: @challenge_seconds

    Repo.insert!(%Token{
      id: Accounts.digest(token),
      kind: kind,
      user_id: user_id,
      data: if(is_nil(data), do: nil, else: :erlang.term_to_binary(data)),
      authenticated_at: if(kind == "session", do: now),
      expires_at: DateTime.add(now, ttl)
    })

    token
  end

  @doc "Returns the signed-in user and when they last proved who they are."
  def session(token) when is_binary(token) do
    now = DateTime.utc_now()

    Repo.one(
      from t in Token,
        join: u in User,
        on: u.id == t.user_id,
        where: t.id == ^Accounts.digest(token) and t.kind == "session" and t.expires_at > ^now,
        select: {u, coalesce(t.authenticated_at, t.inserted_at)}
    )
  end

  def session(_token), do: nil

  @doc "Records a fresh verification (step-up) for an existing session."
  def mark_authenticated(token) when is_binary(token) do
    Repo.update_all(
      from(t in Token, where: t.id == ^Accounts.digest(token) and t.kind == "session"),
      set: [authenticated_at: DateTime.utc_now()]
    )
  end

  def reauth_until(authenticated_at), do: DateTime.add(authenticated_at, @reauth_seconds)

  def recently_authenticated?(authenticated_at),
    do: DateTime.compare(reauth_until(authenticated_at), DateTime.utc_now()) == :gt

  def revoke(token) when is_binary(token),
    do: Repo.delete_all(from t in Token, where: t.id == ^Accounts.digest(token))

  def revoke(_token), do: :ok

  def consume(token, kind) when is_binary(token) do
    now = DateTime.utc_now()

    case Repo.delete_all(
           from t in Token,
             where: t.id == ^Accounts.digest(token) and t.kind == ^kind and t.expires_at > ^now,
             select: t
         ) do
      {1, [record]} -> {:ok, record.user_id, :erlang.binary_to_term(record.data, [:safe])}
      _ -> {:error, :expired_challenge}
    end
  end

  def consume(_token, _kind), do: {:error, :expired_challenge}

  # Passkeys

  @doc """
  Parses the authenticator the person picked: a passkey stored in an app or on a
  phone (`"app"`), or a hardware security key such as a YubiKey (`"security_key"`).
  """
  def authenticator("security_key"), do: {:ok, :security_key}
  def authenticator(method) when method in [nil, "app"], do: {:ok, :app}
  def authenticator(_method), do: {:error, :invalid_authenticator}

  def passkeys(user),
    do: Repo.all(from p in Passkey, where: p.user_id == ^user.id, order_by: p.inserted_at)

  def rename_passkey(user, id, name) do
    with {:ok, name} <- normalize_name(name),
         %Passkey{} = passkey <- Repo.get_by(Passkey, id: id, user_id: user.id) do
      passkey |> Ecto.Changeset.change(name: name) |> Repo.update()
    else
      nil -> {:error, :not_found}
      error -> error
    end
  end

  @doc "Removes a passkey unless it is the account's last way to sign in."
  def delete_passkey(user, id) do
    Repo.transaction(fn ->
      lock_user!(user)

      cond do
        not Repo.exists?(from p in Passkey, where: p.user_id == ^user.id and p.id == ^id) ->
          Repo.rollback(:not_found)

        sign_in_method_count(user) <= 1 ->
          Repo.rollback(:last_sign_in_method)

        true ->
          Repo.delete_all(from p in Passkey, where: p.user_id == ^user.id and p.id == ^id)
      end
    end)
  end

  def registration_options(user, authenticator \\ :app) do
    challenge = Wax.new_registration_challenge(wax_options())

    options = %{
      challenge: encode(challenge.bytes),
      rp: %{id: challenge.rp_id, name: "Phemera"},
      user: %{id: encode(user.id), name: user.email || user.name, displayName: user.name},
      pubKeyCredParams: [%{type: "public-key", alg: -7}, %{type: "public-key", alg: -257}],
      timeout: @challenge_seconds * 1000,
      attestation: "none",
      hints: hints(authenticator),
      authenticatorSelection:
        Map.merge(
          %{residentKey: "required", requireResidentKey: true, userVerification: "required"},
          attachment(authenticator)
        ),
      excludeCredentials: credential_descriptors(passkeys_for(user.id))
    }

    {challenge, options}
  end

  def signup_options(name, authenticator) do
    user = %User{id: Ecto.UUID.generate(), name: name}
    {challenge, options} = registration_options(user, authenticator)

    {%{challenge: challenge, authenticator: authenticator, user_id: user.id, name: name}, options}
  end

  def sign_up(params, %{challenge: challenge, user_id: user_id, name: name} = data) do
    Repo.transaction(fn ->
      user = Repo.insert!(%User{id: user_id, name: name})

      case register(user, params, challenge, data[:authenticator] || :app) do
        {:ok, _passkey} -> user
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def sign_up(_params, _data), do: {:error, :invalid_passkey}

  def authentication_options(authenticator \\ :app) do
    challenge = Wax.new_authentication_challenge(wax_options())

    {challenge,
     %{
       challenge: encode(challenge.bytes),
       rpId: challenge.rp_id,
       userVerification: "required",
       hints: hints(authenticator),
       timeout: @challenge_seconds * 1000
     }}
  end

  @doc """
  Step-up options restricted to the signed-in user's own passkeys, so the
  browser can go straight to the right authenticator without asking.
  """
  def reauthentication_options(user) do
    case passkeys_for(user.id) do
      [] ->
        {:error, :no_passkeys}

      passkeys ->
        challenge = Wax.new_authentication_challenge(wax_options())

        {:ok, challenge,
         %{
           challenge: encode(challenge.bytes),
           rpId: challenge.rp_id,
           userVerification: "required",
           allowCredentials: credential_descriptors(passkeys),
           timeout: @challenge_seconds * 1000
         }}
    end
  end

  def register(user, params, challenge, authenticator \\ :app) do
    with %{"type" => "public-key", "id" => id, "response" => response} <- params,
         {:ok, attestation} <- decode(response["attestationObject"]),
         {:ok, client_data} <- decode(response["clientDataJSON"]),
         true <- same_origin?(client_data),
         {:ok, {data, _attestation}} <- Wax.register(attestation, client_data, challenge),
         credential = data.attested_credential_data,
         true <- id == encode(credential.credential_id),
         true <- credential.credential_public_key[3] in [-7, -257] do
      aaguid = aaguid(data)
      transports = transports(response["transports"])

      %Passkey{
        id: id,
        user_id: user.id,
        name: Authenticators.name(aaguid, authenticator, transports),
        aaguid: aaguid,
        transports: transports,
        backed_up: data.flag_credential_backed_up == true,
        sign_count: data.sign_count,
        public_key: :erlang.term_to_binary(credential.credential_public_key)
      }
      |> Ecto.Changeset.change()
      |> Ecto.Changeset.unique_constraint(:id, name: :passkeys_pkey)
      |> Repo.insert()
      |> case do
        {:ok, passkey} -> {:ok, passkey}
        {:error, _changeset} -> {:error, :invalid_passkey}
      end
    else
      _ -> {:error, :invalid_passkey}
    end
  rescue
    _error in [ArgumentError, FunctionClauseError, MatchError, CaseClauseError, KeyError] ->
      {:error, :invalid_passkey}
  end

  @doc """
  Verifies a passkey assertion. Returns `{:error, :unknown_credential}` when the
  passkey no longer exists here, so the browser can forget it.
  """
  def authenticate(params, challenge) do
    with %{"type" => "public-key", "id" => id} when is_binary(id) <- params,
         %Passkey{} = passkey <- Repo.get(Passkey, id) do
      verify_assertion(passkey, params, challenge)
    else
      nil -> {:error, :unknown_credential}
      _ -> {:error, :invalid_passkey}
    end
  end

  @doc "Verifies a step-up assertion made with one of the signed-in user's own passkeys."
  def reauthenticate(user, params, challenge) do
    case authenticate(params, challenge) do
      {:ok, %User{id: id}} when id == user.id -> :ok
      _ -> {:error, :invalid_passkey}
    end
  end

  defp verify_assertion(passkey, %{"response" => response} = params, challenge) do
    id = params["id"]

    with {:ok, handle} <- decode(response["userHandle"]),
         true <- handle == passkey.user_id,
         {:ok, auth_data} <- decode(response["authenticatorData"]),
         {:ok, signature} <- decode(response["signature"]),
         {:ok, client_data} <- decode(response["clientDataJSON"]),
         true <- same_origin?(client_data),
         {:ok, data} <-
           Wax.authenticate(id, auth_data, signature, client_data, challenge, [
             {id, :erlang.binary_to_term(passkey.public_key, [:safe])}
           ]),
         true <-
           (passkey.sign_count == 0 and data.sign_count == 0) or
             data.sign_count > passkey.sign_count,
         {1, _} <-
           Repo.update_all(
             from(p in Passkey, where: p.id == ^id and p.sign_count == ^passkey.sign_count),
             set: [
               sign_count: data.sign_count,
               backed_up: data.flag_credential_backed_up == true,
               last_used_at: DateTime.utc_now(),
               updated_at: DateTime.utc_now()
             ]
           ) do
      {:ok, Repo.get!(User, passkey.user_id)}
    else
      _ -> {:error, :invalid_passkey}
    end
  rescue
    _error in [ArgumentError, FunctionClauseError, MatchError, CaseClauseError, KeyError] ->
      {:error, :invalid_passkey}
  end

  defp verify_assertion(_passkey, _params, _challenge), do: {:error, :invalid_passkey}

  # Helpers

  defp sign_in_method_count(user) do
    Repo.aggregate(from(p in Passkey, where: p.user_id == ^user.id), :count) +
      Repo.aggregate(from(i in Identity, where: i.user_id == ^user.id), :count)
  end

  defp lock_user!(user),
    do: Repo.one!(from u in User, where: u.id == ^user.id, lock: "FOR UPDATE", select: u.id)

  defp passkeys_for(user_id),
    do: Repo.all(from p in Passkey, where: p.user_id == ^user_id, select: [:id, :transports])

  defp credential_descriptors(passkeys),
    do:
      Enum.map(passkeys, fn
        %{transports: []} = passkey -> %{id: passkey.id, type: "public-key"}
        passkey -> %{id: passkey.id, type: "public-key", transports: passkey.transports}
      end)

  defp hints(:security_key), do: ["security-key"]
  defp hints(:app), do: ["client-device", "hybrid"]

  defp attachment(:security_key), do: %{authenticatorAttachment: "cross-platform"}
  defp attachment(:app), do: %{}

  defp aaguid(data) do
    case Wax.AuthenticatorData.get_aaguid(data) do
      <<_::128>> = aaguid -> Ecto.UUID.load!(aaguid)
      _ -> nil
    end
  end

  defp transports(list) when is_list(list),
    do: list |> Enum.filter(&(&1 in @transports)) |> Enum.uniq()

  defp transports(_list), do: []

  defp wax_options,
    do: [
      origin: origin(),
      rp_id: rp_id(),
      user_verification: "required",
      timeout: @challenge_seconds,
      trusted_attestation_types: [:none]
    ]

  defp encode(bytes), do: Base.url_encode64(bytes, padding: false)

  defp same_origin?(client_data) do
    case Jason.decode(client_data) do
      {:ok, data} when is_map(data) -> Map.get(data, "crossOrigin", false) == false
      _ -> false
    end
  end

  defp decode(value) when is_binary(value) and byte_size(value) <= 32_768,
    do: Base.url_decode64(value, padding: false)

  defp decode(_value), do: :error
end
