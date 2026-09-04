defmodule AnyshareWeb do
  @moduledoc false

  def controller do
    quote do
      use Phoenix.Controller, formats: [:json], layouts: []
      import Plug.Conn
      alias AnyshareWeb.ControllerHelpers
    end
  end

  def router do
    quote do
      use Phoenix.Router
      import Plug.Conn
      import Phoenix.Controller
    end
  end

  defmacro __using__(which) when is_atom(which), do: apply(__MODULE__, which, [])
end
