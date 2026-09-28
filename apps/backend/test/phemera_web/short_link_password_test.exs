defmodule PhemeraWeb.ShortLinkPasswordTest do
  use PhemeraWeb.ConnCase, async: true

  alias Phemera.Accounts
  alias Phemera.Repo
  alias Phemera.Sharing.ShortLink
  alias Phemera.Sharing.Transfer
  alias Phemera.SignalsFixture

  @password "four random words"

  setup do
    {:ok, token, _sender} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "short-link-password")

    secret = %{
      "version" => 3,
      "kdf" => "hkdf-sha256",
      "password" => false,
      "cipher" => "aes-256-gcm",
      "iv" => Base.encode64(:crypto.strong_rand_bytes(12))
    }

    %{token: token, secret: secret}
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

  test "locks a shared message until its password is entered", %{
    conn: conn,
    token: token,
    secret: secret
  } do
    body = Base.encode64(:crypto.strong_rand_bytes(32))

    created =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/transfers", %{
        "kind" => "text",
        "body" => body,
        "secret" => secret,
        "password" => @password
      })
      |> json_response(201)

    code = created["short_link"]["code"]
    assert created["short_link"]["password_protected"]
    assert created["short_link"]["body"] == body

    public = conn |> get("/api/v1/short_links/#{code}") |> json_response(200)
    assert public["short_link"]["kind"] == "text"
    assert public["short_link"]["password_protected"]
    refute Map.has_key?(public["short_link"], "body")
    refute Map.has_key?(public["short_link"], "secret")
    assert Repo.get!(ShortLink, code).view_count == 0
    assert conn |> get("/s/#{code}") |> response(401) =~ "password"

    assert conn
           |> post("/api/v1/short_links/#{code}/unlock", %{"password" => "wrong password"})
           |> json_response(401) == %{"error" => "incorrect password"}

    assert Repo.get!(ShortLink, code).view_count == 0

    unlocked =
      conn
      |> post("/api/v1/short_links/#{code}/unlock", %{"password" => @password})
      |> json_response(200)

    assert unlocked["short_link"]["body"] == body
    assert unlocked["short_link"]["secret"] == secret
    assert Repo.get!(ShortLink, code).view_count == 1
  end

  test "locks a shared file and its download", %{
    conn: conn,
    token: token,
    secret: secret
  } do
    created =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/transfers", %{
        "kind" => "file",
        "filename" => "secret.anyshare",
        "content_type" => "application/octet-stream",
        "byte_size" => 32,
        "secret" => secret
      })
      |> json_response(201)

    id = created["transfer"]["id"]

    assert conn
           |> put_req_header("authorization", "Bearer #{token}")
           |> post("/api/v1/transfers/#{id}/complete", %{"password" => "too short"})
           |> json_response(422)

    assert Repo.get!(Transfer, id).status == "pending"

    completed =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/transfers/#{id}/complete", %{
        "password" => @password,
        "signals" => SignalsFixture.signals()
      })
      |> json_response(200)

    code = completed["short_link"]["code"]
    assert completed["short_link"]["password_protected"]

    public = conn |> get("/api/v1/short_links/#{code}") |> json_response(200)
    assert public["short_link"]["kind"] == "file"
    assert public["short_link"]["password_protected"]
    refute Map.has_key?(public["short_link"], "filename")
    refute Map.has_key?(public["short_link"], "download")
    assert conn |> get("/s/#{code}") |> response(401) =~ "password"

    assert conn |> get("/api/v1/short_links/#{code}/download") |> json_response(401)
    assert conn |> get("/api/v1/short_links/#{code}/download?token=invalid") |> json_response(401)
    assert Repo.get!(ShortLink, code).download_count == 0

    unlocked =
      conn
      |> post("/api/v1/short_links/#{code}/unlock", %{"password" => @password})
      |> json_response(200)

    download = unlocked["short_link"]["download"]["url"]
    assert download =~ "/api/v1/short_links/#{code}/download?token="
    assert conn |> get(download) |> redirected_to() =~ "/api/v1/local_blobs/"
    assert Repo.get!(ShortLink, code).download_count == 1
  end
end
