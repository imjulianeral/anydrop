defmodule AnyshareWeb.SessionControllerTest do
  use AnyshareWeb.ConnCase, async: true

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
end
