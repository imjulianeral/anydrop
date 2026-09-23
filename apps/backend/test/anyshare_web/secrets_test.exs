defmodule AnyshareWeb.SecretsTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.Transfer

  setup do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "secrets-test")

    secret = %{
      "version" => 1,
      "kdf" => "argon2id",
      "memory" => 65_536,
      "iterations" => 3,
      "parallelism" => 4,
      "cipher" => "aes-256-gcm",
      "salt" => Base.encode64(:crypto.strong_rand_bytes(16)),
      "iv" => Base.encode64(:crypto.strong_rand_bytes(12))
    }

    %{token: token, device: device, secret: secret}
  end

  test "stores and returns ciphertext with its encryption profile", %{
    conn: conn,
    token: token,
    secret: secret
  } do
    body = Base.encode64(:crypto.strong_rand_bytes(65_536 + 16))

    response =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/transfers", %{kind: "text", body: body, secret: secret})
      |> json_response(201)

    transfer = response["transfer"]
    assert transfer["secret"] == secret
    assert transfer["body"] == body
    assert Repo.get!(Transfer, transfer["id"]).body == body
    code = response["short_link"]["code"]
    public = conn |> get("/api/v1/short_links/#{code}") |> json_response(200)
    assert public["short_link"]["body"] == body
    assert public["short_link"]["secret"] == secret
    assert conn |> get("/s/#{code}") |> response(403) =~ "Secret"
  end

  test "preserves Secrets in device history and event payloads", %{device: device, secret: secret} do
    {:ok, _token, recipient} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "secrets-test")

    body = Base.encode64(:crypto.strong_rand_bytes(32))

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(device, %{
        "kind" => "text",
        "body" => body,
        "secret" => secret,
        "recipient_id" => recipient.id
      })

    assert [saved] = Sharing.list_transfers(recipient, device.id)
    assert saved.secret == secret
    assert Sharing.transfer_json(transfer, recipient).secret == secret
    assert Sharing.transfer_json(transfer, recipient).body == body
  end

  test "rejects invalid profiles and plaintext-looking payloads", %{
    device: device,
    secret: secret
  } do
    for invalid <- [
          Map.put(secret, "memory", 2_147_483_647),
          Map.put(secret, "version", 2),
          Map.put(secret, "salt", "bad"),
          %{}
        ] do
      assert {:error, %Ecto.Changeset{valid?: false}} =
               Sharing.create_transfer(device, %{
                 "kind" => "text",
                 "body" => Base.encode64(:crypto.strong_rand_bytes(32)),
                 "secret" => invalid
               })
    end

    assert {:error, %Ecto.Changeset{valid?: false}} =
             Sharing.create_transfer(device, %{
               "kind" => "text",
               "body" => "private plaintext",
               "secret" => secret
             })
  end

  test "requires opaque file metadata and bounds ciphertext size", %{
    device: device,
    secret: secret
  } do
    params = %{
      "kind" => "file",
      "filename" => "secret.anyshare",
      "content_type" => "application/octet-stream",
      "byte_size" => 100,
      "secret" => secret
    }

    assert {:ok, transfer, nil} = Sharing.create_transfer(device, params)
    assert transfer.secret == secret
    assert transfer.r2_key =~ "/secret.anyshare"

    for invalid <- [
          %{"filename" => "private.pdf"},
          %{"content_type" => "application/pdf"},
          %{"byte_size" => 200 * 1024 * 1024},
          %{"body" => "private text"}
        ] do
      assert {:error, %Ecto.Changeset{valid?: false}} =
               Sharing.create_transfer(device, Map.merge(params, invalid))
    end
  end

  test "rejects plaintext text and file creates", %{device: device} do
    for params <- [
          %{"kind" => "text", "body" => "hello"},
          %{
            "kind" => "file",
            "filename" => "private.txt",
            "content_type" => "text/plain",
            "byte_size" => 100
          }
        ] do
      assert {:error, %Ecto.Changeset{} = changeset} = Sharing.create_transfer(device, params)
      assert {"can't be blank", []} == changeset.errors[:secret]
    end
  end

  test "accepts v3 public drops and refuses raw ciphertext text downloads", %{
    conn: conn,
    token: token
  } do
    secret = v3_secret()
    body = Base.encode64(:crypto.strong_rand_bytes(32))

    result =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/transfers", %{kind: "text", body: body, secret: secret})
      |> json_response(201)

    assert result["transfer"]["secret"] == secret
    assert conn |> get("/s/#{result["short_link"]["code"]}") |> response(403) =~ "Secret"
  end

  test "requires a wrap only for nearby v3 and validates password profiles", %{device: device} do
    {:ok, _, recipient} = Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "secrets-test")

    params = %{
      "kind" => "text",
      "body" => Base.encode64(:crypto.strong_rand_bytes(32)),
      "secret" => v3_secret()
    }

    assert {:error, %Ecto.Changeset{}} =
             Sharing.create_transfer(device, Map.put(params, "recipient_id", recipient.id))

    wrapped = Map.put(v3_secret(), "wrap", key_wrap())

    assert {:ok, _, _} =
             Sharing.create_transfer(
               device,
               Map.merge(params, %{"secret" => wrapped, "recipient_id" => recipient.id})
             )

    for invalid <- [
          wrapped,
          Map.put(v3_secret(), "salt", Base.encode64(<<0::128>>)),
          Map.put(v3_secret(), "password", true),
          Map.put(v3_secret(), "password", "false"),
          Map.put(v3_secret(), "iv", "invalid")
        ] do
      assert {:error, %Ecto.Changeset{}} =
               Sharing.create_transfer(device, Map.put(params, "secret", invalid))
    end

    password_secret =
      Map.merge(v3_secret(), %{"password" => true, "salt" => Base.encode64(<<0::128>>)})

    assert {:error, %Ecto.Changeset{}} =
             Sharing.create_transfer(device, Map.put(params, "secret", password_secret))

    for field <- ["ephemeral_public", "iv", "ciphertext"] do
      bad_wrap = Map.put(key_wrap(), field, "invalid")

      assert {:error, %Ecto.Changeset{}} =
               Sharing.create_transfer(
                 device,
                 Map.merge(params, %{
                   "recipient_id" => recipient.id,
                   "secret" => Map.put(v3_secret(), "wrap", bad_wrap)
                 })
               )
    end
  end

  test "v3 streams preserve the full upload cap without a password", %{device: device} do
    secret =
      v3_secret() |> Map.delete("iv") |> Map.put("cipher", "secretstream-xchacha20poly1305")

    maximum = 5 * Integer.pow(1024, 4) - 5 * Integer.pow(1024, 3)

    params = %{
      "kind" => "file",
      "filename" => "secret.anyshare",
      "content_type" => "application/octet-stream",
      "byte_size" => maximum,
      "secret" => secret
    }

    assert {:ok, _, nil} = Sharing.create_transfer(device, params)

    for invalid <- [
          %{"byte_size" => maximum + 1},
          %{"byte_size" => 70},
          %{"secret" => Map.put(secret, "iv", Base.encode64(<<0::96>>))},
          %{"kind" => "text", "body" => Base.encode64(<<0::256>>)}
        ] do
      assert {:error, %Ecto.Changeset{}} =
               Sharing.create_transfer(device, Map.merge(params, invalid))
    end
  end

  defp v3_secret do
    %{
      "version" => 3,
      "kdf" => "hkdf-sha256",
      "password" => false,
      "cipher" => "aes-256-gcm",
      "iv" => Base.encode64(<<0::96>>)
    }
  end

  defp key_wrap do
    %{
      "alg" => "ecdh-p256-hkdf-aes-gcm",
      "ephemeral_public" => Base.encode64(<<0x30, 0::720>>),
      "iv" => Base.encode64(<<0::96>>),
      "ciphertext" => Base.encode64(<<0::384>>)
    }
  end

  test "accepts large streaming Secrets only with the fixed file profile", %{
    device: device,
    secret: secret
  } do
    profile =
      secret
      |> Map.delete("iv")
      |> Map.put("version", 2)
      |> Map.put("cipher", "secretstream-xchacha20poly1305")

    maximum = 5 * Integer.pow(1024, 4) - 5 * Integer.pow(1024, 3)

    params = %{
      "kind" => "file",
      "filename" => "secret.anyshare",
      "content_type" => "application/octet-stream",
      "byte_size" => 200 * 1024 * 1024,
      "secret" => profile
    }

    assert {:ok, transfer, nil} = Sharing.create_transfer(device, params)
    assert Sharing.transfer_json(transfer, device).secret == profile
    assert {:ok, _, nil} = Sharing.create_transfer(device, Map.put(params, "byte_size", maximum))

    for changes <- [
          %{"byte_size" => maximum + 1},
          %{"byte_size" => 70},
          %{"secret" => Map.put(profile, "iv", secret["iv"])},
          %{"secret" => Map.put(profile, "memory", 1)},
          %{"secret" => Map.put(profile, "salt", "bad")},
          %{"filename" => "private.txt"},
          %{"body" => "private"},
          %{"kind" => "text", "body" => Base.encode64(:crypto.strong_rand_bytes(32))}
        ] do
      assert {:error, %Ecto.Changeset{valid?: false}} =
               Sharing.create_transfer(device, Map.merge(params, changes))
    end
  end

  test "counts a Secret download when access is granted", %{
    conn: conn,
    device: device,
    secret: secret
  } do
    {:ok, transfer, nil} =
      Sharing.create_transfer(device, %{
        "kind" => "file",
        "filename" => "secret.anyshare",
        "content_type" => "application/octet-stream",
        "byte_size" => 100,
        "secret" => secret
      })

    {:ok, transfer} = Sharing.complete_transfer(device, transfer.id)
    {:ok, link} = Sharing.mint_short_link(device, transfer)

    assert conn |> get("/api/v1/short_links/#{link.code}/download") |> redirected_to() =~
             "download=1"

    assert Repo.get!(Anyshare.Sharing.ShortLink, link.code).download_count == 1
    public = conn |> get("/api/v1/short_links/#{link.code}") |> json_response(200)
    assert public["short_link"]["secret"] == secret
    assert public["short_link"]["filename"] == "secret.anyshare"
    refute Map.has_key?(public["short_link"], "track_download")
  end
end
