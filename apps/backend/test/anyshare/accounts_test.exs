defmodule Anyshare.AccountsTest do
  use Anyshare.DataCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.Repo
  alias Anyshare.Time

  test "tokens use SHA-256 digests and authenticate devices" do
    token = Accounts.issue_token()
    device = insert_device(%{token_digest: Accounts.digest(token)})

    assert Accounts.authenticate(token).id == device.id
    assert Accounts.authenticate("nope") == nil
  end

  test "peers share an IP hash or room code" do
    now = Time.now()

    current =
      insert_device(%{
        display_name: "Self",
        ip_hash: "same",
        room_code: "ABC123",
        last_seen_at: now
      })

    nearby = insert_device(%{display_name: "Near", ip_hash: "same", last_seen_at: now})

    roomed =
      insert_device(%{
        display_name: "Room",
        ip_hash: "other",
        room_code: "ABC123",
        last_seen_at: now
      })

    _away = insert_device(%{display_name: "Away", ip_hash: "other", last_seen_at: now})

    peer_ids = current |> Accounts.list_peers() |> Enum.map(& &1.id)

    assert nearby.id in peer_ids
    assert roomed.id in peer_ids
    assert length(peer_ids) == 2
  end

  defp insert_device(overrides) do
    sequence = System.unique_integer([:positive])

    attrs =
      Map.merge(
        %{
          id: Ecto.UUID.generate(),
          display_name: "Amber Fox",
          device_kind: "desktop",
          ip_hash: "ip-#{sequence}",
          token_digest: Accounts.digest("token-#{sequence}"),
          last_seen_at: Time.now(),
          created_at: Time.now()
        },
        overrides
      )

    %Device{} |> Device.changeset(attrs) |> Repo.insert!()
  end
end
