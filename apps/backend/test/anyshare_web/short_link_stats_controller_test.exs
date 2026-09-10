defmodule AnyshareWeb.ShortLinkStatsControllerTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.LinkEvent
  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Time

  setup do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "stats-test")

    {:ok, link} = Sharing.create_short_link(device, "https://example.com")
    %{token: token, device: device, link: link}
  end

  test "returns utc event times for only the requested link without recording a view", %{
    conn: conn,
    token: token,
    device: device,
    link: link
  } do
    {:ok, other_link} = Sharing.create_short_link(device, "https://example.com/other")
    now = Time.utc_now()
    today = now
    yesterday = DateTime.add(now, -86_400, :second)
    stale = DateTime.add(now, -9 * 86_400, :second)
    record_event(link, "view", today)
    record_event(link, "view", today)
    record_event(link, "download", yesterday)
    record_event(link, "view", stale)
    record_event(other_link, "view", today)

    link
    |> Ecto.Changeset.change(%{view_count: 2, download_count: 1})
    |> Repo.update!()

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links/#{String.downcase(link.code)}/stats")

    payload = json_response(conn, 200)
    events = payload["events"]
    assert payload["view_count"] == 2
    assert payload["download_count"] == 1
    assert Enum.map(events, & &1["kind"]) == ["download", "view", "view"]
    assert Enum.all?(events, &String.ends_with?(&1["occurred_at"], "Z"))
    assert Enum.at(events, 0)["occurred_at"] == Time.iso8601(yesterday)
    assert Enum.at(events, 1)["occurred_at"] == Time.iso8601(today)
    assert Repo.get!(ShortLink, link.code).view_count == 2
    assert length(Sharing.list_events(device)) == 4
  end

  test "requires authentication", %{conn: conn, link: link} do
    conn = get(conn, "/api/v1/short_links/#{link.code}/stats")
    assert json_response(conn, 401) == %{"error" => "unauthorized"}
  end

  test "does not expose another device's stats", %{conn: conn, link: link} do
    {:ok, token, _device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "other-device")

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links/#{link.code}/stats")

    assert json_response(conn, 404) == %{"error" => "not found"}
  end

  test "returns not found for expired links", %{conn: conn, token: token, link: link} do
    link
    |> ShortLink.changeset(%{expires_at: NaiveDateTime.add(Time.now(), -1)})
    |> Repo.update!()

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links/#{link.code}/stats")

    assert json_response(conn, 404) == %{"error" => "not found"}
  end

  test "returns not found for missing links", %{conn: conn, token: token} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links/missing/stats")

    assert json_response(conn, 404) == %{"error" => "not found"}
  end

  defp record_event(link, kind, occurred_at) do
    %LinkEvent{}
    |> LinkEvent.changeset(%{
      id: Ecto.UUID.generate(),
      code: link.code,
      kind: kind,
      occurred_at: occurred_at
    })
    |> Repo.insert!()
  end
end
