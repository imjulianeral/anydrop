defmodule PhemeraWeb.SessionControllerTest do
  use PhemeraWeb.ConnCase, async: true

  test "creates a session with the existing response contract", %{conn: conn} do
    conn =
      post(conn, "/api/v1/sessions", %{
        "id" => Ecto.UUID.generate(),
        "display_name" => "Amber Fox",
        "device_kind" => "desktop"
      })

    response = json_response(conn, 201)

    assert byte_size(response["token"]) == 64
    assert response["device"]["display_name"] == "Amber Fox"
    assert response["peers"] == []
  end

  test "rejects invalid device IDs", %{conn: conn} do
    conn = post(conn, "/api/v1/sessions", %{"id" => "not-a-uuid"})
    assert json_response(conn, 422) == %{"error" => "invalid id"}
  end

  test "a public user ID cannot renew a session or replace its encryption key" do
    id = Ecto.UUID.generate()
    token = Phemera.Accounts.issue_token()

    response =
      build_conn()
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/sessions", %{id: id, display_name: "Original"})
      |> json_response(201)

    assert response["token"] == token

    assert build_conn()
           |> post("/api/v1/sessions", %{id: id, display_name: "Impostor"})
           |> json_response(401)

    assert build_conn()
           |> put_req_header("authorization", "Bearer #{Phemera.Accounts.issue_token()}")
           |> post("/api/v1/sessions", %{id: id})
           |> json_response(401)

    renewed =
      build_conn()
      |> put_req_header("authorization", "Bearer #{token}")
      |> post("/api/v1/sessions", %{id: id})
      |> json_response(201)

    assert renewed["token"] == token
    assert renewed["device"]["display_name"] == "Original"
    refute Map.has_key?(renewed["device"], "token_digest")
  end
end
