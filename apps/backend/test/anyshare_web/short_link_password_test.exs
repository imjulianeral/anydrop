defmodule AnyshareWeb.ShortLinkPasswordTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing.ShortLink

  @password "four random words"

  setup do
    {:ok, token, _sender} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "short-link-password")

    %{token: token}
  end

  test "hides the destination until the password is correct", %{conn: conn, token: token} do
    created =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/short_links", %{
        "url" => "https://example.com/private",
        "password" => @password
      })
      |> json_response(201)

    code = created["short_link"]["code"]
    assert created["short_link"]["password_protected"]
    assert created["short_link"]["url"] == "https://example.com/private"
    refute created["short_link"]["password_verifier"]

    listed =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> get("/api/v1/short_links")
      |> json_response(200)

    assert Enum.find(listed["short_links"], &(&1["code"] == code))["url"] ==
             "https://example.com/private"

    public = conn |> get("/api/v1/short_links/#{code}") |> json_response(200)
    assert public["short_link"]["password_protected"]
    refute Map.has_key?(public["short_link"], "url")
    assert Repo.get!(ShortLink, code).view_count == 0

    assert conn |> get("/s/#{code}") |> response(401) =~ "password"
    assert Repo.get!(ShortLink, code).view_count == 0

    assert conn
           |> post("/api/v1/short_links/#{code}/unlock", %{"password" => "wrong password"})
           |> json_response(401) == %{"error" => "incorrect password"}

    assert Repo.get!(ShortLink, code).view_count == 0

    unlocked =
      conn
      |> post("/api/v1/short_links/#{code}/unlock", %{"password" => @password})
      |> json_response(200)

    assert unlocked["short_link"]["url"] == "https://example.com/private"
    assert Repo.get!(ShortLink, code).view_count == 1
    stored = Repo.get!(ShortLink, code).password_verifier
    assert is_binary(stored)
    refute stored =~ @password
  end

  test "rejects a short password", %{conn: conn, token: token} do
    assert conn
           |> put_req_header("authorization", "Bearer #{token}")
           |> post("/api/v1/short_links", %{
             "url" => "https://example.com",
             "password" => "too short"
           })
           |> json_response(422)
  end
end
