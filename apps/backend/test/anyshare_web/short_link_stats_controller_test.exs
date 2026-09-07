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

  test "returns seven days for only the requested link without recording a view", %{
    conn: conn,
    token: token,
    device: device,
    link: link
  } do
    {:ok, other_link} = Sharing.create_short_link(device, "https://example.com/other")
    today = Date.utc_today()
    yesterday = Date.add(today, -1)
    record_event(link, "view", today)
    record_event(link, "view", today)
    record_event(link, "download", yesterday)
    record_event(link, "view", Date.add(today, -7))
    record_event(other_link, "view", today)

    link
    |> Ecto.Changeset.change(%{view_count: 2, download_count: 1})
    |> Repo.update!()

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links/#{String.downcase(link.code)}/stats")

    payload = json_response(conn, 200)
    stats = payload["stats"]
    assert payload["view_count"] == 2
    assert payload["download_count"] == 1
    assert length(stats) == 7
    assert hd(stats)["date"] == Date.to_iso8601(Date.add(today, -6))
    assert hd(stats)["views"] == 0
    assert hd(stats)["downloads"] == 0
    assert List.last(stats) == %{"date" => Date.to_iso8601(today), "views" => 2, "downloads" => 0}

    assert Enum.at(stats, -2) == %{
             "date" => Date.to_iso8601(yesterday),
             "views" => 0,
             "downloads" => 1
           }

    assert Repo.get!(ShortLink, link.code).view_count == 2
    assert List.last(Sharing.daily_stats(device)).views == 3
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

  defp record_event(link, kind, date) do
    %LinkEvent{}
    |> LinkEvent.changeset(%{
      id: Ecto.UUID.generate(),
      code: link.code,
      kind: kind,
      occurred_at: NaiveDateTime.new!(date, ~T[00:00:00])
    })
    |> Repo.insert!()
  end
end
