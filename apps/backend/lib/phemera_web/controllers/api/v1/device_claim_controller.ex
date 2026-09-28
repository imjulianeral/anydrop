defmodule PhemeraWeb.Api.V1.DeviceClaimController do
  use PhemeraWeb, :controller

  alias Phemera.DeviceOwnership

  def index(conn, _params) do
    claims = DeviceOwnership.pending_for_device(conn.assigns.current_device)
    json(conn, %{claims: Enum.map(claims, &DeviceOwnership.claim_json/1)})
  end

  def update(conn, %{"id" => id} = params) do
    case DeviceOwnership.respond_claim(conn.assigns.current_device, id, params["action"]) do
      {:ok, claim} -> json(conn, %{claim: DeviceOwnership.claim_json(claim)})
      {:error, reason} -> PhemeraWeb.AccountDeviceController.error(conn, reason)
    end
  end
end
