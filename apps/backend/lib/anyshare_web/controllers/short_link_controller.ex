defmodule AnyshareWeb.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing
  alias Anyshare.Sharing.Transfer

  def show(conn, %{"code" => code}) do
    case Sharing.get_live_short_link(code) do
      nil ->
        send_resp(conn, 404, "")

      %{transfer: %Transfer{kind: "text"} = transfer} = link ->
        Sharing.record_event(link, "view")
        conn |> put_resp_content_type("text/plain") |> send_resp(200, transfer.body)

      %{target_url: target_url} = link when is_binary(target_url) ->
        Sharing.record_event(link, "view")
        conn |> put_resp_header("location", target_url) |> send_resp(302, "")

      _link ->
        send_resp(conn, 404, "")
    end
  end
end
