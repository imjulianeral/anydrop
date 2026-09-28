defmodule Phemera.PasskeyFixture do
  def key do
    {<<4, x::binary-size(32), y::binary-size(32)>>, private} =
      :crypto.generate_key(:ecdh, :secp256r1)

    %{
      id: :crypto.strong_rand_bytes(32),
      private: private,
      public: %{1 => 2, 3 => -7, -1 => 1, -2 => x, -3 => y}
    }
  end

  def registration(key, challenge, options \\ []) do
    client = client_data("webauthn.create", challenge, options)

    public =
      Map.new(key.public, fn {k, v} ->
        {k, if(is_binary(v), do: %CBOR.Tag{tag: :bytes, value: v}, else: v)}
      end)

    flags = Keyword.get(options, :flags, 0x45)

    aaguid =
      case Keyword.fetch(options, :aaguid) do
        {:ok, uuid} -> Ecto.UUID.dump!(uuid)
        :error -> <<0::128>>
      end

    data =
      :crypto.hash(:sha256, challenge.rp_id) <>
        <<flags, 0::32>> <> aaguid <> <<byte_size(key.id)::16>> <> key.id <> CBOR.encode(public)

    attestation =
      CBOR.encode(%{
        "fmt" => "none",
        "attStmt" => %{},
        "authData" => %CBOR.Tag{tag: :bytes, value: data}
      })

    %{
      "id" => encode(key.id),
      "type" => "public-key",
      "response" => %{
        "clientDataJSON" => encode(client),
        "attestationObject" => encode(attestation)
      }
    }
  end

  def assertion(key, user, challenge, options \\ []) do
    client = client_data("webauthn.get", challenge, options)
    count = Keyword.get(options, :count, 1)
    flags = Keyword.get(options, :flags, 5)
    rp_id = Keyword.get(options, :rp_id, challenge.rp_id)
    data = :crypto.hash(:sha256, rp_id) <> <<flags, count::32>>

    signature =
      :crypto.sign(:ecdsa, :sha256, data <> :crypto.hash(:sha256, client), [
        key.private,
        :secp256r1
      ])

    %{
      "id" => encode(key.id),
      "type" => "public-key",
      "response" => %{
        "userHandle" => encode(user.id),
        "clientDataJSON" => encode(client),
        "authenticatorData" => encode(data),
        "signature" => encode(signature)
      }
    }
  end

  defp client_data(type, challenge, options),
    do:
      Jason.encode!(%{
        type: type,
        challenge: encode(challenge.bytes),
        origin: Keyword.get(options, :origin, challenge.origin),
        crossOrigin: Keyword.get(options, :cross_origin, false)
      })

  defp encode(bytes), do: Base.url_encode64(bytes, padding: false)
end
