defmodule AnyshareWeb.Internal.ExpireController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing
  alias AnyshareWeb.Plugs.AuthenticateDevice

  def create(conn, _params) do
    if authorized?(conn) do
      :ok = Sharing.expire_stale()
      json(conn, %{ok: true})
    else
      ControllerHelpers.error(conn, :unauthorized, "unauthorized")
    end
  end

  defp authorized?(conn) do
    secret = Application.get_env(:anyshare, :expire_secret)
    environment = Application.get_env(:anyshare, :environment)

    cond do
      not present?(secret) and environment != :prod -> true
      not present?(secret) -> false
      true -> secure_compare(AuthenticateDevice.bearer_token(conn) || "", secret)
    end
  end

  defp secure_compare(left, right) when byte_size(left) == byte_size(right),
    do: :crypto.hash_equals(left, right)

  defp secure_compare(_left, _right), do: false
  defp present?(value), do: is_binary(value) and value != ""
end
