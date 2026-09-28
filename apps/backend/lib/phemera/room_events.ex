defmodule Phemera.RoomEvents do
  @moduledoc false

  alias Phemera.Accounts.Device

  @spec broadcast(Device.t(), String.t(), map()) :: :ok
  def broadcast(device, type, payload) do
    message = Map.put(payload, :type, type)
    Phoenix.PubSub.broadcast(Phemera.PubSub, ip_topic(device), {:room_event, message})

    if type in ["peer_joined", "peer_updated", "peer_left"] do
      for id <- Phemera.Accounts.reachable_device_ids(device.id) do
        notify_device(id, type, payload)
      end
    end

    :ok
  end

  @spec notify_device(String.t(), String.t(), map()) :: :ok
  def notify_device(device_id, type, payload) when is_binary(device_id) do
    message = Map.put(payload, :type, type)
    Phoenix.PubSub.broadcast(Phemera.PubSub, device_topic(device_id), {:room_event, message})
    :ok
  end

  @spec topics(Device.t()) :: [String.t()]
  def topics(device) do
    [device_topic(device.id), ip_topic(device)]
  end

  defp device_topic(device_id), do: "device:#{device_id}"
  defp ip_topic(device), do: "room:ip:#{device.ip_hash}"
end
