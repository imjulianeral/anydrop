defmodule PhemeraWeb.AccountDeviceController do
  use PhemeraWeb, :controller

  alias Phemera.DeviceOwnership
  alias PhemeraWeb.Plugs.AccountDevice
  alias PhemeraWeb.Plugs.RequireAccount

  plug RequireAccount
  plug AccountDevice, [required: true] when action in [:save_current, :create_claim]
  plug AccountDevice when action == :index

  def index(conn, _params) do
    user = conn.assigns.current_user
    device = conn.assigns.current_device

    json(conn, %{
      devices: Enum.map(DeviceOwnership.list_owned(user), &DeviceOwnership.device_json/1),
      claims: Enum.map(DeviceOwnership.pending_for_user(user), &DeviceOwnership.claim_json/1),
      current: device && %{id: device.id, status: DeviceOwnership.status(user, device)}
    })
  end

  def save_current(conn, params) do
    conn.assigns.current_user
    |> DeviceOwnership.save_current(conn.assigns.current_device, params["name"])
    |> device_response(conn)
  end

  def update(conn, %{"id" => id} = params) do
    conn.assigns.current_user
    |> DeviceOwnership.rename(id, params["name"])
    |> device_response(conn)
  end

  def delete(conn, %{"id" => id}) do
    case DeviceOwnership.remove(conn.assigns.current_user, id) do
      {:ok, _device} -> json(conn, %{ok: true})
      {:error, reason} -> error(conn, reason)
    end
  end

  def create_claim(conn, params) do
    case DeviceOwnership.request_claim(
           conn.assigns.current_user,
           conn.assigns.current_device,
           params["device_id"],
           params["name"]
         ) do
      {:ok, claim} ->
        conn |> put_status(:created) |> json(%{claim: DeviceOwnership.claim_json(claim)})

      {:error, reason} ->
        error(conn, reason)
    end
  end

  def cancel_claim(conn, %{"id" => id}) do
    case DeviceOwnership.cancel_claim(conn.assigns.current_user, id) do
      {:ok, claim} -> json(conn, %{claim: DeviceOwnership.claim_json(claim)})
      {:error, reason} -> error(conn, reason)
    end
  end

  defp device_response({:ok, device}, conn),
    do: json(conn, %{device: DeviceOwnership.device_json(device)})

  defp device_response({:error, reason}, conn), do: error(conn, reason)

  @doc false
  def error(conn, reason) do
    {status, message} = message(reason)
    ControllerHelpers.error(conn, status, message)
  end

  defp message(:not_found),
    do: {:not_found, "That device isn't nearby anymore. Make sure it's open on this network."}

  defp message(:invalid_name), do: {:unprocessable_entity, "Enter a name up to 40 characters."}

  defp message(:other_account),
    do: {:conflict, "This device is saved to another account. Its owner has to remove it first."}

  defp message(:already_mine), do: {:conflict, "That device is already saved to your account."}

  defp message(:already_pending),
    do: {:conflict, "Someone else is already asking to save that device. Try again shortly."}

  defp message(:rate_limited),
    do: {:too_many_requests, "Too many requests. Wait a minute and try again."}

  defp message(:expired), do: {:gone, "This request expired. Send a new one."}
  defp message(:already_answered), do: {:conflict, "This request was already answered."}
  defp message(:invalid_action), do: {:unprocessable_entity, "Choose accept or decline."}
end
