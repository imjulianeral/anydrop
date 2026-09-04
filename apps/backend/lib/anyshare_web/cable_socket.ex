defmodule AnyshareWeb.CableSocket do
  @moduledoc false

  @behaviour WebSock

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.RoomEvents

  @ping_interval 3_000

  @impl true
  def init(device) do
    schedule_ping()

    {:push, text_frame(%{type: "welcome"}), %{device: device, identifier: nil, subscribed: false}}
  end

  @impl true
  def handle_in({payload, [opcode: :text]}, state) do
    case Jason.decode(payload) do
      {:ok, %{"command" => "subscribe", "identifier" => identifier}} ->
        subscribe(identifier, state)

      {:ok, %{"command" => "unsubscribe"}} ->
        unsubscribe(state)

      {:ok, %{"command" => "message", "data" => data}} ->
        perform(data, state)

      _invalid_message ->
        {:ok, state}
    end
  end

  def handle_in({_payload, _metadata}, state), do: {:ok, state}

  @impl true
  def handle_info(:ping, state) do
    schedule_ping()
    {:push, text_frame(%{type: "ping", message: System.system_time(:second)}), state}
  end

  def handle_info({:room_event, message}, %{subscribed: true, identifier: identifier} = state) do
    {:push, text_frame(%{identifier: identifier, message: message}), state}
  end

  def handle_info(_message, state), do: {:ok, state}

  @impl true
  def terminate(_reason, %{subscribed: true, device: device}) do
    RoomEvents.broadcast(device, "peer_left", %{id: device.id})
    :ok
  end

  def terminate(_reason, _state), do: :ok

  defp subscribe(identifier, %{subscribed: false, device: device} = state) do
    case channel(identifier) do
      "RoomChannel" ->
        Enum.each(RoomEvents.topics(device), &Phoenix.PubSub.subscribe(Anyshare.PubSub, &1))
        RoomEvents.broadcast(device, "peer_joined", Accounts.peer_json(device))

        {:push, text_frame(%{type: "confirm_subscription", identifier: identifier}),
         %{state | identifier: identifier, subscribed: true}}

      _unsupported ->
        {:push, text_frame(%{type: "reject_subscription", identifier: identifier}), state}
    end
  end

  defp subscribe(identifier, state) do
    {:push, text_frame(%{type: "confirm_subscription", identifier: identifier}), state}
  end

  defp unsubscribe(%{subscribed: true, device: device} = state) do
    RoomEvents.broadcast(device, "peer_left", %{id: device.id})
    Enum.each(RoomEvents.topics(device), &Phoenix.PubSub.unsubscribe(Anyshare.PubSub, &1))
    {:ok, %{state | identifier: nil, subscribed: false}}
  end

  defp unsubscribe(state), do: {:ok, state}

  defp perform(data, %{device: %Device{id: device_id}} = state) do
    case Jason.decode(data) do
      {:ok, %{"action" => "heartbeat"}} -> Accounts.touch_seen_if_stale(device_id)
      _other -> :ok
    end

    {:ok, state}
  end

  defp channel(identifier) do
    case Jason.decode(identifier) do
      {:ok, %{"channel" => channel}} -> channel
      _invalid_identifier -> nil
    end
  end

  defp schedule_ping, do: Process.send_after(self(), :ping, @ping_interval)
  defp text_frame(payload), do: {:text, Jason.encode!(payload)}
end
