defmodule PhemeraWeb.SecurityHeadersTest do
  use PhemeraWeb.ConnCase, async: true

  test "API headers also cover preflight and only HTTPS gets HSTS", %{conn: conn} do
    for scheme <- [:http, :https] do
      response = conn |> options("#{scheme}://www.example.com/api/v1/sessions")
      assert get_resp_header(response, "x-content-type-options") == ["nosniff"]
      assert get_resp_header(response, "referrer-policy") == ["no-referrer"]
      assert get_resp_header(response, "x-frame-options") == ["DENY"]

      assert get_resp_header(response, "permissions-policy") == [
               "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
             ]

      expected = if scheme == :https, do: ["max-age=31536000; includeSubDomains"], else: []
      assert get_resp_header(response, "strict-transport-security") == expected
    end
  end
end
