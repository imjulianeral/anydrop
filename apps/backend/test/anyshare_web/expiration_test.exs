defmodule AnyshareWeb.ExpirationTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Sharing.Transfer
  alias Anyshare.Time

  setup do
    {:ok, token, sender} = Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "expiry-test")

    {:ok, peer_token, peer} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "expiry-test")

    %{token: token, sender: sender, peer_token: peer_token, peer: peer}
  end

  test "all new items default to six hours", %{sender: sender} do
    {:ok, text, _} =
      Sharing.create_transfer(sender, %{
        "kind" => "text",
        "body" => ciphertext(),
        "secret" => secret()
      })

    {:ok, file, _} = Sharing.create_transfer(sender, file_params())
    {:ok, url} = Sharing.create_short_link(sender, "https://example.com")
    {:ok, drop} = Sharing.mint_short_link(sender, text)

    for item <- [text, file, url, drop] do
      assert_in_delta NaiveDateTime.diff(item.expires_at, item.created_at), 21_600, 1
      assert is_nil(item.max_downloads)
    end
  end

  test "creation APIs apply custom durations and count limits", %{conn: conn, token: token} do
    conn = put_req_header(conn, "authorization", "Bearer #{token}")

    text =
      conn
      |> post("/api/v1/transfers", %{
        "kind" => "text",
        "body" => ciphertext(),
        "secret" => secret(),
        "expires_in" => 3600,
        "max_downloads" => 5
      })
      |> json_response(201)

    assert text["transfer"]["max_downloads"] == 5
    assert text["short_link"]["max_downloads"] == 5
    assert_duration(text["transfer"], 3600)

    url =
      conn
      |> post("/api/v1/short_links", %{
        "url" => "https://example.com",
        "expires_in" => 43_200,
        "max_downloads" => 1
      })
      |> json_response(201)

    assert url["short_link"]["max_downloads"] == 1
    assert_duration(url["short_link"], 43_200)
  end

  test "invalid limits return validation errors", %{conn: conn, token: token} do
    conn = put_req_header(conn, "authorization", "Bearer #{token}")

    for limits <- [
          %{"expires_in" => -1},
          %{"expires_in" => "bad"},
          %{"max_downloads" => 0},
          %{"max_downloads" => 101},
          %{"max_downloads" => 1.5}
        ] do
      assert conn
             |> post("/api/v1/short_links", Map.put(limits, "url", "https://example.com"))
             |> json_response(422)

      assert conn
             |> post(
               "/api/v1/transfers",
               Map.merge(limits, %{"kind" => "text", "body" => ciphertext(), "secret" => secret()})
             )
             |> json_response(422)
    end
  end

  test "file previews do not consume limits and concurrent downloads share the limit", %{
    conn: conn,
    sender: sender
  } do
    {:ok, transfer, _} =
      Sharing.create_transfer(sender, Map.put(file_params(), "max_downloads", 1))

    {:ok, transfer} = Sharing.complete_transfer(sender, transfer.id)
    {:ok, link} = Sharing.mint_short_link(sender, transfer)

    payload = conn |> get("/api/v1/short_links/#{link.code}") |> json_response(200)
    assert payload["short_link"]["download"]["url"] == "/api/v1/short_links/#{link.code}/download"
    assert Repo.get!(Transfer, transfer.id).download_count == 0

    results =
      1..4
      |> Task.async_stream(fn _ -> Sharing.consume_short_link(link.code, "download") end)
      |> Enum.map(fn {:ok, result} -> result end)

    assert Enum.count(results, &match?({:ok, _}, &1)) == 1
    assert Enum.count(results, &match?({:error, :not_found}, &1)) == 3
    assert Repo.get!(Transfer, transfer.id).download_count == 1
    assert Repo.get!(ShortLink, link.code).download_count == 1
    assert conn |> get("/api/v1/short_links/#{link.code}/download") |> json_response(404)
    assert conn |> get("/api/v1/short_links/#{link.code}") |> json_response(404)
  end

  test "URL opens expire across both entry points", %{conn: conn, sender: sender} do
    {:ok, link} =
      Sharing.create_short_link(sender, "https://example.com", %{"max_downloads" => 1})

    assert conn |> get("/s/#{link.code}") |> redirected_to() == "https://example.com"
    assert conn |> get("/api/v1/short_links/#{link.code}") |> json_response(404)
    assert conn |> get("/s/#{link.code}") |> response(404) == ""
    assert Sharing.list_short_links(sender) == []
  end

  test "public messages expire after the selected number of opens", %{conn: conn, sender: sender} do
    {:ok, transfer, _} =
      Sharing.create_transfer(sender, %{
        "kind" => "text",
        "body" => ciphertext(),
        "secret" => secret(),
        "max_downloads" => 1
      })

    {:ok, link} = Sharing.mint_short_link(sender, transfer)

    assert conn
           |> get("/api/v1/short_links/#{link.code}")
           |> json_response(200)
           |> get_in(["short_link", "body"]) == ciphertext()

    assert conn |> get("/s/#{link.code}") |> response(404) == ""
  end

  test "peer history does not reveal or consume a limited message", %{
    conn: conn,
    sender: sender,
    peer: peer,
    peer_token: peer_token
  } do
    {:ok, transfer, _} =
      Sharing.create_transfer(sender, %{
        "kind" => "text",
        "body" => ciphertext(),
        "secret" => secret(),
        "recipient_id" => peer.id,
        "max_downloads" => 1
      })

    conn = put_req_header(conn, "authorization", "Bearer #{peer_token}")
    history = conn |> get("/api/v1/transfers?peer_id=#{sender.id}") |> json_response(200)
    assert [%{"max_downloads" => 1} = item] = history["transfers"]
    refute Map.has_key?(item, "body")
    assert Repo.get!(Transfer, transfer.id).download_count == 0
    opened = conn |> get("/api/v1/transfers/#{transfer.id}") |> json_response(200)
    assert opened["transfer"]["body"] == ciphertext()
    assert conn |> get("/api/v1/transfers/#{transfer.id}") |> json_response(404)
  end

  test "peer downloads require a signed capability and enforce the shared limit", %{
    conn: conn,
    sender: sender,
    peer: peer
  } do
    params = Map.merge(file_params(), %{"recipient_id" => peer.id, "max_downloads" => 1})
    {:ok, transfer, _} = Sharing.create_transfer(sender, params)
    {:ok, transfer} = Sharing.complete_transfer(sender, transfer.id)
    url = Sharing.transfer_json(transfer, peer, download: true).download.url
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{sender.id}")
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{peer.id}")

    assert conn
           |> get("/api/v1/transfers/#{transfer.id}/download?token=invalid")
           |> json_response(404)

    assert conn |> get(url) |> redirected_to() =~ "download=1"
    assert Repo.get!(Transfer, transfer.id).download_count == 0
    refute_receive {:room_event, %{type: "transfer_usage"}}

    assert conn |> get("#{url}&save=1") |> redirected_to() =~ "download=1"
    transfer_id = transfer.id
    assert_receive {:room_event, %{type: "transfer_usage", id: ^transfer_id, download_count: 1}}
    assert_receive {:room_event, %{type: "transfer_usage", id: ^transfer_id, download_count: 1}}
    assert conn |> get("#{url}&save=1") |> json_response(404)
    assert Repo.get!(Transfer, transfer.id).download_count == 1
    refute_receive {:room_event, %{type: "transfer_usage"}}
  end

  test "time expiration blocks access before the cleanup job runs", %{
    conn: conn,
    sender: sender,
    peer: peer
  } do
    {:ok, transfer, _} =
      Sharing.create_transfer(sender, Map.put(file_params(), "recipient_id", peer.id))

    {:ok, transfer} = Sharing.complete_transfer(sender, transfer.id)
    url = Sharing.transfer_json(transfer, peer, download: true).download.url
    {:ok, link} = Sharing.mint_short_link(sender, transfer)

    transfer
    |> Transfer.changeset(%{expires_at: NaiveDateTime.add(Time.now(), -1)})
    |> Repo.update!()

    assert conn |> get(url) |> json_response(404)
    assert conn |> get("/api/v1/short_links/#{link.code}") |> json_response(404)
    assert conn |> get("/api/v1/short_links/#{link.code}/download") |> json_response(404)
  end

  defp ciphertext, do: Base.encode64(<<0::256>>)

  defp secret do
    %{
      "version" => 1,
      "kdf" => "argon2id",
      "memory" => 65_536,
      "iterations" => 3,
      "parallelism" => 4,
      "cipher" => "aes-256-gcm",
      "salt" => Base.encode64(<<0::128>>),
      "iv" => Base.encode64(<<0::96>>)
    }
  end

  defp file_params do
    %{
      "kind" => "file",
      "filename" => "secret.anyshare",
      "byte_size" => 100,
      "content_type" => "application/octet-stream",
      "secret" => secret()
    }
  end

  defp assert_duration(payload, seconds) do
    {:ok, expires, _} = DateTime.from_iso8601(payload["expires_at"])
    {:ok, created, _} = DateTime.from_iso8601(payload["created_at"])
    assert DateTime.diff(expires, created) == seconds
  end
end
