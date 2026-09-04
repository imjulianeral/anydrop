defmodule Anyshare.RoomEvents do
  @moduledoc false

  alias Anyshare.Accounts.Device

  @spec broadcast(Device.t(), String.t(), map()) :: :ok
  def broadcast(device, type, payload) do
    message = Map.put(payload, :type, type)
    Phoenix.PubSub.broadcast(Anyshare.PubSub, ip_topic(device), {:room_event, message})

    if is_binary(device.room_code) and device.room_code != "" do
      Phoenix.PubSub.broadcast(Anyshare.PubSub, code_topic(device), {:room_event, message})
    end

    :ok
  end

  @spec topics(Device.t()) :: [String.t()]
  def topics(device) do
    [ip_topic(device)] ++
      if is_binary(device.room_code) and device.room_code != "" do
        [code_topic(device)]
      else
        []
      end
  end

  defp ip_topic(device), do: "room:ip:#{device.ip_hash}"
  defp code_topic(device), do: "room:code:#{device.room_code}"
end
