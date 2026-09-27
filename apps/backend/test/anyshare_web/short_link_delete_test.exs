defmodule AnyshareWeb.ShortLinkDeleteTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing.LinkEvent
  alias Anyshare.Sharing.ShortLink

  test "only the creator can delete a link, which revokes it and removes its events", %{
    conn: conn
  } do
    {:ok, owner_token, _owner} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "link-owner")

    {:ok, other_token, _other} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "other-device")

    created =
      conn
      |> put_req_header("authorization", "Bearer #{owner_token}")
      |> post("/api/v1/short_links", %{"url" => "https://example.com"})
      |> json_response(201)

    code = created["short_link"]["code"]
    assert conn |> get("/api/v1/short_links/#{code}") |> json_response(200)
    assert Repo.aggregate(LinkEvent, :count) == 1

    assert conn
           |> put_req_header("authorization", "Bearer #{other_token}")
           |> delete("/api/v1/short_links/#{code}")
           |> json_response(404) == %{"error" => "not found"}

    assert Repo.get(ShortLink, code)

    assert conn
           |> put_req_header("authorization", "Bearer #{owner_token}")
           |> delete("/api/v1/short_links/#{code}")
           |> response(204) == ""

    refute Repo.get(ShortLink, code)
    assert Repo.aggregate(LinkEvent, :count) == 0
    assert conn |> get("/api/v1/short_links/#{code}") |> json_response(404)
  end
end
