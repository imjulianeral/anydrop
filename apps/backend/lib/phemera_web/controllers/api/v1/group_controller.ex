defmodule PhemeraWeb.Api.V1.GroupController do
  use PhemeraWeb, :controller
  alias Phemera.Groups
  alias Phemera.Sharing

  def index(conn, _params) do
    groups = Groups.list_with_team(conn.assigns.current_device)
    json(conn, %{groups: Enum.map(groups, &Groups.json/1)})
  end

  def create(conn, params),
    do: respond(conn, Groups.create(conn.assigns.current_device, params), :created)

  def update(conn, %{"id" => id} = params),
    do: respond(conn, Groups.update(conn.assigns.current_device, id, params), :ok)

  def delete(conn, %{"id" => id}),
    do: respond(conn, Groups.delete(conn.assigns.current_device, id), :no_content)

  def leave(conn, %{"id" => id}),
    do: respond(conn, Groups.leave(conn.assigns.current_device, id), :no_content)

  def transfers(conn, %{"id" => id}) do
    device = conn.assigns.current_device

    if Groups.member?(device, id) do
      transfers =
        Enum.map(
          Sharing.list_group_transfers(device, id),
          &Sharing.transfer_json(&1, device, download: true)
        )

      json(conn, %{transfers: transfers})
    else
      ControllerHelpers.error(conn, :not_found, "Group not found")
    end
  end

  defp respond(conn, {:ok, _group}, :no_content), do: send_resp(conn, :no_content, "")

  defp respond(conn, {:ok, group}, status),
    do: conn |> put_status(status) |> json(%{group: Groups.json(group)})

  defp respond(conn, {:error, %Ecto.Changeset{} = changeset}, _status),
    do: ControllerHelpers.changeset_error(conn, changeset)

  defp respond(conn, {:error, :not_found}, _status),
    do: ControllerHelpers.error(conn, :not_found, "Group not found")

  defp respond(conn, {:error, :invalid_members}, _status),
    do:
      ControllerHelpers.error(
        conn,
        :unprocessable_entity,
        "Choose up to 49 other available devices."
      )

  defp respond(conn, {:error, :owner_cannot_leave}, _status),
    do:
      ControllerHelpers.error(
        conn,
        :unprocessable_entity,
        "The creator must delete the group instead of leaving."
      )
end
