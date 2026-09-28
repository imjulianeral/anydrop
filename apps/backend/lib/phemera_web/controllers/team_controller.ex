defmodule PhemeraWeb.TeamController do
  use PhemeraWeb, :controller

  alias Phemera.Teams
  alias PhemeraWeb.Plugs.RequireAccount

  plug RequireAccount when action != :preview

  def show(conn, _params) do
    team = Teams.get(conn.assigns.current_user)
    json(conn, %{team: team && Teams.json(team)})
  end

  def create(conn, params) do
    case Teams.create(conn.assigns.current_user, params["name"]) do
      {:ok, _team} -> conn |> put_status(:created) |> show(params)
      {:error, reason} -> error(conn, reason)
    end
  end

  def update(conn, params) do
    case Teams.rename(conn.assigns.current_user, params["name"]) do
      {:ok, _team} -> show(conn, params)
      {:error, reason} -> error(conn, reason)
    end
  end

  def delete(conn, _params), do: ok(conn, Teams.delete(conn.assigns.current_user))

  def invite(conn, params) do
    case Teams.invite(conn.assigns.current_user, params["email"]) do
      {:ok, invitation, url} ->
        conn
        |> put_status(:created)
        |> json(%{invitation: Teams.invitation_json(invitation), url: url})

      {:error, reason} ->
        error(conn, reason)
    end
  end

  def revoke_invitation(conn, %{"id" => id}),
    do: ok(conn, Teams.revoke_invitation(conn.assigns.current_user, id))

  def remove_member(conn, %{"user_id" => user_id}),
    do: ok(conn, Teams.remove_member(conn.assigns.current_user, user_id))

  def leave(conn, _params), do: ok(conn, Teams.leave(conn.assigns.current_user))

  def preview(conn, %{"token" => token}) do
    case Teams.preview(token) do
      {:ok, preview} -> json(conn, %{invitation: preview})
      {:error, reason} -> error(conn, reason)
    end
  end

  def accept(conn, %{"token" => token}) do
    case Teams.accept(conn.assigns.current_user, token) do
      {:ok, team} -> json(conn, %{team: %{id: team.id, name: team.name}})
      {:error, reason} -> error(conn, reason)
    end
  end

  defp ok(conn, :ok), do: json(conn, %{ok: true})
  defp ok(conn, {:error, reason}), do: error(conn, reason)

  defp error(conn, %Ecto.Changeset{} = changeset),
    do: ControllerHelpers.changeset_error(conn, changeset)

  defp error(conn, reason) do
    {status, message} = message(reason)
    ControllerHelpers.error(conn, status, message)
  end

  defp message(:not_enterprise),
    do: {:forbidden, "Teams are part of the enterprise plan."}

  defp message(:forbidden), do: {:forbidden, "Only the team owner can do that."}
  defp message(:not_found), do: {:not_found, "Not found."}
  defp message(:invalid_name), do: {:unprocessable_entity, "Enter a name up to 80 characters."}
  defp message(:invalid_email), do: {:unprocessable_entity, "Enter a valid email address."}
  defp message(:already_member), do: {:conflict, "That person is already on the team."}
  defp message(:team_full), do: {:conflict, "This team has reached its member limit."}
  defp message(:already_in_team), do: {:conflict, "You're already on a team. Leave it first."}

  defp message(:owner_cannot_leave),
    do: {:unprocessable_entity, "The owner can't leave. Delete the team instead."}

  defp message(:rate_limited),
    do: {:too_many_requests, "Too many invitations. Try again in an hour."}

  defp message(:invalid_invitation),
    do: {:not_found, "This invitation is no longer valid. Ask for a new one."}
end
