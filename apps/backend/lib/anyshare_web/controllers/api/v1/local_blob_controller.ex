defmodule AnyshareWeb.Api.V1.LocalBlobController do
  use AnyshareWeb, :controller

  alias Anyshare.ObjectStore

  def show(conn, params) do
    key = key_from(params["key"])

    case ObjectStore.local_file(key) do
      {:ok, path} ->
        filename = path |> Path.basename() |> String.replace(~r/["\\]/u, "_")
        kind = if params["download"] == "1", do: "attachment", else: "inline"

        conn
        |> put_resp_content_type(MIME.from_path(filename))
        |> put_resp_header("content-disposition", ~s(#{kind}; filename="#{filename}"))
        |> send_file(200, path)

      {:error, _reason} ->
        send_resp(conn, 404, "")
    end
  end

  def update(conn, %{"key" => key_parts}) do
    case ObjectStore.write_local(key_from(key_parts), conn) do
      {:ok, next_conn} -> send_resp(next_conn, 201, "")
      {:error, :invalid_key} -> send_resp(conn, 404, "")
      {:error, _reason} -> send_resp(conn, 500, "")
    end
  end

  defp key_from(parts) when is_list(parts), do: Enum.join(parts, "/")
  defp key_from(key), do: key
end
