defmodule Anyshare.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Anyshare.Repo,
      {Phoenix.PubSub, name: Anyshare.PubSub},
      AnyshareWeb.Endpoint
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: Anyshare.Supervisor)
  end

  @impl true
  def config_change(changed, _new, removed) do
    AnyshareWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
