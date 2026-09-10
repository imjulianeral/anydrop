defmodule Anyshare.Sharing.RecordEventTest do
  use Anyshare.DataCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.ShortLink

  setup do
    {:ok, _token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "record-event")

    {:ok, link} = Sharing.create_short_link(device, "https://example.com")
    %{device: device, link: link}
  end

  test "increments views and notifies the owner", %{device: device, link: link} do
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{device.id}")

    assert Sharing.record_event(link, "view") == :ok
    assert Repo.get!(ShortLink, link.code).view_count == 1

    assert_receive {:room_event, message}
    assert message.type == "short_link_event"
    assert message.kind == "view"
    assert message.code == link.code
    assert message.view_count == 1
    assert message.download_count == 0
    assert message.occurred_at =~ "Z"
    {:ok, occurred_at, 0} = DateTime.from_iso8601(message.occurred_at)
    assert DateTime.diff(occurred_at, DateTime.utc_now(), :second) <= 2
  end

  test "increments downloads", %{device: device, link: link} do
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{device.id}")

    assert Sharing.record_event(link, "download") == :ok
    assert Repo.get!(ShortLink, link.code).download_count == 1

    assert_receive {:room_event, message}
    assert message.kind == "download"
    assert message.download_count == 1
  end
end
