defmodule AnyshareWeb.Api.V1.InvitationController do
  use AnyshareWeb, :controller
  alias Anyshare.Invitations

  def index(conn, _params) do
    json(conn, %{
      invitations: Enum.map(Invitations.list(conn.assigns.current_device), &Invitations.json/1)
    })
  end

  def create(conn, params) do
    conn.assigns.current_device
    |> Invitations.create(Map.get(params, "target"))
    |> respond(conn, :created)
  end

  def update(conn, %{"id" => id} = params) do
    conn.assigns.current_device
    |> Invitations.respond(id, Map.get(params, "action"))
    |> respond(conn, :ok)
  end

  defp respond({:ok, invitation}, conn, status),
    do: conn |> put_status(status) |> json(%{invitation: Invitations.json(invitation)})

  defp respond({:error, reason}, conn, _status) do
    {status, message} = error(reason)
    ControllerHelpers.error(conn, status, message)
  end

  defp error(:not_found),
    do: {:not_found, "No device or invitation found. Check the exact nickname or user ID."}

  defp error(:invalid_target), do: {:unprocessable_entity, "Enter an exact nickname or user ID."}

  defp error(:ambiguous),
    do: {:conflict, "More than one device uses that nickname. Use their user ID."}

  defp error(:self_invite),
    do: {:unprocessable_entity, "You cannot invite this device to itself."}

  defp error(:offline),
    do: {:conflict, "That device is offline. Ask them to open AnyShare and try again."}

  defp error(:already_pending),
    do: {:conflict, "An invitation between these devices is already pending."}

  defp error(:already_connected), do: {:conflict, "You are already connected to that device."}

  defp error(:rate_limited),
    do: {:too_many_requests, "Too many invitations. Wait a minute and try again."}

  defp error(:expired), do: {:gone, "This invitation expired. Ask for a new invitation."}
  defp error(:already_answered), do: {:conflict, "This invitation is no longer available."}

  defp error(:invalid_action),
    do: {:unprocessable_entity, "Choose accept, decline, or disconnect."}
end
