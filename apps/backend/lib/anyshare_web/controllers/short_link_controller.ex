defmodule AnyshareWeb.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.ObjectStore
  alias Anyshare.Sharing
  alias Anyshare.Sharing.Transfer

  def show(conn, %{"code" => code}) do
    case Sharing.get_live_short_link(code) do
      nil ->
        send_resp(conn, 404, "")

      %{transfer: %Transfer{kind: "file"} = transfer} ->
        if transfer.status in ["uploaded", "delivered"] and present?(transfer.r2_key) do
          conn
          |> put_resp_header("location", ObjectStore.presign_get(transfer.r2_key))
          |> send_resp(302, "")
        else
          send_resp(conn, 404, "")
        end

      %{transfer: %Transfer{kind: "text"} = transfer} ->
        conn |> put_resp_content_type("text/plain") |> send_resp(200, transfer.body)

      %{target_url: target_url} when is_binary(target_url) ->
        conn |> put_resp_header("location", target_url) |> send_resp(302, "")

      _link ->
        send_resp(conn, 404, "")
    end
  end

  defp present?(value), do: is_binary(value) and value != ""
end
