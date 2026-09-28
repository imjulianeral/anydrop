defmodule Phemera.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        Phemera.Repo,
        {Phoenix.PubSub, name: Phemera.PubSub},
        {Task.Supervisor, name: Phemera.TaskSupervisor},
        PhemeraWeb.Endpoint
      ] ++ hash_list_sync()

    Supervisor.start_link(children, strategy: :one_for_one, name: Phemera.Supervisor)
  end

  defp hash_list_sync do
    if Application.get_env(:phemera, :environment) == :test,
      do: [],
      else: [Phemera.Moderation.Sync]
  end

  @impl true
  def config_change(changed, _new, removed) do
    PhemeraWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
