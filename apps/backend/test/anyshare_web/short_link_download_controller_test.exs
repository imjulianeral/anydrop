defmodule AnyshareWeb.ShortLinkDownloadControllerTest do
  use AnyshareWeb.ConnCase, async: true

  import Ecto.Query

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.Sharing.LinkEvent
  alias Anyshare.Sharing.ShortLink

  setup do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "download-test")

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(device, %{
        "kind" => "file",
        "filename" => "notes.txt",
        "byte_size" => 4,
        "content_type" => "text/plain"
      })

    {:ok, transfer} = Sharing.complete_transfer(device, transfer.id)
    {:ok, link} = Sharing.mint_short_link(device, transfer)

    %{token: token, device: device, link: link}
  end

  test "records a download and redirects to the file", %{conn: conn, link: link} do
    conn =
      conn
      |> put_req_header("accept", "text/html,application/xhtml+xml")
      |> get("/api/v1/short_links/#{String.downcase(link.code)}/download")

    location = redirected_to(conn)
    assert location =~ "/api/v1/local_blobs/"
    assert location =~ "download=1"
    assert Repo.get!(ShortLink, link.code).download_count == 1
    assert Repo.get!(ShortLink, link.code).view_count == 0

    assert [%LinkEvent{kind: "download"}] =
             Repo.all(from(event in LinkEvent, where: event.code == ^link.code))
  end

  test "does not treat opening the drop as a download", %{conn: conn, link: link} do
    conn = get(conn, "/api/v1/short_links/#{link.code}")
    assert json_response(conn, 200)["short_link"]["download_count"] == 0
    assert Repo.get!(ShortLink, link.code).view_count == 1
    assert Repo.get!(ShortLink, link.code).download_count == 0
  end

  test "legacy /s/:code does not start a file download", %{conn: conn, link: link} do
    conn = get(conn, "/s/#{link.code}")
    assert conn.status == 404
    assert Repo.get!(ShortLink, link.code).download_count == 0
  end

  test "returns not found for url drops", %{conn: conn, device: device} do
    {:ok, link} = Sharing.create_short_link(device, "https://example.com")
    conn = get(conn, "/api/v1/short_links/#{link.code}/download")
    assert json_response(conn, 404) == %{"error" => "not found"}
  end
end
