defmodule AnyshareWeb.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing
  alias Anyshare.Sharing.Transfer

  def show(conn, %{"code" => code}) do
    case Sharing.get_live_short_link(code) do
      nil ->
        send_resp(conn, 404, "")

      %{transfer: %Transfer{secret: secret}} when not is_nil(secret) ->
        conn
        |> put_resp_content_type("text/plain")
        |> send_resp(403, "Open this Secret in the web app.")

      %{transfer: %Transfer{kind: "text"} = transfer} = link ->
        case Sharing.consume_short_link(link.code, "view") do
          {:ok, _link} ->
            conn |> put_resp_content_type("text/plain") |> send_resp(200, transfer.body)

          {:error, :not_found} ->
            send_resp(conn, 404, "")
        end

      %{target_url: target_url, password_verifier: verifier}
      when is_binary(target_url) and is_binary(verifier) ->
        conn
        |> put_resp_content_type("text/plain")
        |> send_resp(401, "This link requires a password. Open it in the web app.")

      %{target_url: target_url} = link when is_binary(target_url) ->
        case Sharing.consume_short_link(link.code, "view") do
          {:ok, _link} -> conn |> put_resp_header("location", target_url) |> send_resp(302, "")
          {:error, :not_found} -> send_resp(conn, 404, "")
        end

      _link ->
        send_resp(conn, 404, "")
    end
  end
end
