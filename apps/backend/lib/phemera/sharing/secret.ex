defmodule Phemera.Sharing.Secret do
  @moduledoc false

  import Ecto.Changeset

  @profile %{
    "version" => 1,
    "kdf" => "argon2id",
    "memory" => 65_536,
    "iterations" => 3,
    "parallelism" => 4,
    "cipher" => "aes-256-gcm"
  }
  @max_cipher_bytes 100 * 1024 * 1024 + 4096 + 20
  @stream_profile %{
    @profile
    | "version" => 2,
      "cipher" => "secretstream-xchacha20poly1305"
  }
  @max_stream_bytes 5 * Integer.pow(1024, 4) - 5 * Integer.pow(1024, 3)

  def validate(changeset) do
    case get_field(changeset, :secret) do
      nil -> add_error(changeset, :secret, "can't be blank")
      secret -> validate_secret(changeset, secret)
    end
  end

  defp validate_secret(changeset, secret) do
    cond do
      valid_v3?(secret) ->
        validate_v3(changeset, secret)

      map_size(secret) == 8 and Map.take(secret, Map.keys(@profile)) == @profile and
        valid_base64?(secret["salt"], 16, 16) and valid_base64?(secret["iv"], 12, 12) ->
        validate_payload(changeset)

      map_size(secret) == 7 and Map.take(secret, Map.keys(@stream_profile)) == @stream_profile and
        valid_base64?(secret["salt"], 16, 16) and get_field(changeset, :kind) == "file" ->
        validate_file(changeset, 71, @max_stream_bytes)

      true ->
        add_error(changeset, :secret, "has an unsupported encryption format")
    end
  end

  defp valid_v3?(secret) do
    secret["version"] == 3 and secret["kdf"] == "hkdf-sha256" and
      is_boolean(secret["password"]) and valid_password?(secret) and
      (not Map.has_key?(secret, "wrap") or valid_wrap?(secret["wrap"])) and
      case secret["cipher"] do
        "aes-256-gcm" -> valid_base64?(secret["iv"], 12, 12)
        "secretstream-xchacha20poly1305" -> not Map.has_key?(secret, "iv")
        _ -> false
      end
  end

  defp valid_password?(%{"password" => false} = secret), do: not Map.has_key?(secret, "salt")
  defp valid_password?(_), do: false

  defp valid_wrap?(wrap) when is_map(wrap) do
    wrap["alg"] == "ecdh-p256-hkdf-aes-gcm" and
      valid_base64?(wrap["ephemeral_public"], 91, 91) and
      valid_base64?(wrap["iv"], 12, 12) and valid_base64?(wrap["ciphertext"], 48, 48)
  end

  defp valid_wrap?(_), do: false

  defp validate_v3(changeset, secret) do
    changeset =
      case {get_field(changeset, :recipient_id), Map.has_key?(secret, "wrap")} do
        {nil, true} -> add_error(changeset, :secret, "must not be set for a public drop")
        {id, false} when not is_nil(id) -> add_error(changeset, :secret, "can't be blank")
        _ -> changeset
      end

    case {secret["cipher"], get_field(changeset, :kind)} do
      {"aes-256-gcm", _} ->
        validate_payload(changeset)

      {"secretstream-xchacha20poly1305", "file"} ->
        validate_file(changeset, 71, @max_stream_bytes)

      _ ->
        add_error(changeset, :secret, "has an unsupported encryption format")
    end
  end

  defp validate_payload(changeset) do
    case get_field(changeset, :kind) do
      "text" ->
        if valid_base64?(get_field(changeset, :body), 17, 65_536 + 16) do
          changeset
        else
          add_error(changeset, :body, "must contain an encrypted message of at most 64 KiB")
        end

      "file" ->
        validate_file(changeset, 20, @max_cipher_bytes)

      _other ->
        changeset
    end
  end

  defp validate_file(changeset, minimum, maximum) do
    changeset
    |> validate_inclusion(:filename, ["secret.anyshare"])
    |> validate_inclusion(:content_type, ["application/octet-stream"])
    |> validate_required([:content_type])
    |> validate_number(:byte_size,
      greater_than_or_equal_to: minimum,
      less_than_or_equal_to: maximum
    )
    |> validate_absence_of_body()
  end

  defp validate_absence_of_body(changeset) do
    if get_field(changeset, :body) do
      add_error(changeset, :body, "must be empty for secret files")
    else
      changeset
    end
  end

  defp valid_base64?(value, min_bytes, max_bytes) when is_binary(value) do
    if byte_size(value) <= div(max_bytes + 2, 3) * 4 do
      case Base.decode64(value) do
        {:ok, bytes} ->
          byte_size(bytes) >= min_bytes and byte_size(bytes) <= max_bytes and
            Base.encode64(bytes) == value

        :error ->
          false
      end
    else
      false
    end
  end

  defp valid_base64?(_value, _min, _max), do: false
end
