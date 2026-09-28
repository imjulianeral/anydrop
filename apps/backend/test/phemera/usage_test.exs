defmodule Phemera.UsageTest do
  use Phemera.DataCase, async: true

  alias Phemera.Accounts
  alias Phemera.Repo
  alias Phemera.Sharing
  alias Phemera.Sharing.ShortLink
  alias Phemera.Usage

  test "tracking the same day, kind and metric adds to one row" do
    {_token, device} = device("Desk", "net-a")

    :ok = Usage.track(device.id, "file", "sent", 10)
    :ok = Usage.track(device.id, "file", "sent", 5)
    :ok = Usage.track(device.id, "nope", "sent")
    :ok = Usage.track(nil, "file", "sent")

    today = Date.utc_today()

    assert [%{day: ^today, kind: "file", metric: "sent", count: 2, bytes: 15}] =
             Usage.rows([device.id], today, today)
  end

  test "links count when created, viewed and downloaded, and outlive expiry" do
    {_token, device} = device("Desk", "net-a")
    {:ok, link} = Sharing.create_short_link(device, "https://example.com")
    {:ok, _link} = Sharing.consume_short_link(link.code, "view")
    {:ok, _link} = Sharing.consume_short_link(link.code, "view")

    Repo.update_all(ShortLink, set: [expires_at: ~N[2000-01-01 00:00:00]])
    :ok = Sharing.expire_stale()
    refute Repo.get(ShortLink, link.code)

    today = Date.utc_today()

    assert metrics(device.id, today) == %{{"url", "created"} => 1, {"url", "view"} => 2}
  end

  test "nearby sends count for the sender and the recipient" do
    {_token, sender} = device("Desk", "net-a")
    {_token, recipient} = device("Phone", "net-a")

    {:ok, _transfer, _recipient} =
      Sharing.create_transfer(sender, %{
        "recipient_id" => recipient.id,
        "kind" => "text",
        "body" => Base.encode64(:crypto.strong_rand_bytes(32)),
        "secret" => secret()
      })

    today = Date.utc_today()
    assert metrics(sender.id, today) == %{{"text", "sent"} => 1}
    assert metrics(recipient.id, today) == %{{"text", "received"} => 1}
  end

  test "pruning drops counters past the retention window" do
    {_token, device} = device("Desk", "net-a")
    old = Date.add(Date.utc_today(), -401)

    Repo.insert_all("usage_daily", [
      %{device_id: device.id, day: old, kind: "url", metric: "view", count: 3, bytes: 0}
    ])

    :ok = Usage.track(device.id, "url", "view")
    :ok = Usage.prune()

    assert Usage.rows([device.id], old, old) == []
    assert [%{count: 1}] = Usage.rows([device.id], Date.utc_today(), Date.utc_today())
  end

  defp metrics(device_id, day) do
    [device_id]
    |> Usage.rows(day, day)
    |> Map.new(&{{&1.kind, &1.metric}, &1.count})
  end

  defp device(name, network) do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp secret do
    %{
      "version" => 3,
      "kdf" => "hkdf-sha256",
      "password" => false,
      "cipher" => "aes-256-gcm",
      "iv" => Base.encode64(<<0::96>>),
      "wrap" => %{
        "alg" => "ecdh-p256-hkdf-aes-gcm",
        "ephemeral_public" => Base.encode64(<<0x30, 0::720>>),
        "iv" => Base.encode64(<<0::96>>),
        "ciphertext" => Base.encode64(<<0::384>>)
      }
    }
  end
end
