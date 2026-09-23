defmodule Anyshare.Groups do
  @moduledoc false
  import Ecto.Query

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.Groups.Group
  alias Anyshare.Repo
  alias Anyshare.RoomEvents

  def list(device) do
    Repo.all(
      from g in member_query(device.id), order_by: [asc: g.inserted_at], preload: [:members]
    )
  end

  def get(device, id) when is_binary(id) do
    Repo.one(from g in member_query(device.id), where: g.id == ^id, preload: [:members])
  end

  def get(_device, _id), do: nil

  def create(device, params) do
    Repo.transaction(fn ->
      ids = validate_members(device, Map.get(params, "member_ids", []), [device.id])
      group = %Group{id: Ecto.UUID.generate(), owner_id: device.id}
      group = save(group, params)
      replace_members(group.id, ids)
      {Repo.preload(group, :members), ids}
    end)
    |> publish()
  end

  def update(device, id, params) do
    Repo.transaction(fn ->
      group = lock(id)
      if group.owner_id != device.id, do: Repo.rollback(:not_found)
      previous = member_ids(group)
      ids = validate_members(device, Map.get(params, "member_ids", previous), previous)
      group = save(group, params)
      replace_members(id, ids)
      {Repo.preload(group, :members, force: true), Enum.uniq(previous ++ ids)}
    end)
    |> publish()
  end

  def delete(device, id) do
    Repo.transaction(fn ->
      group = lock(id)
      if group.owner_id != device.id, do: Repo.rollback(:not_found)
      ids = member_ids(group)
      Repo.delete!(group)
      {group, ids}
    end)
    |> publish()
  end

  def leave(device, id) do
    Repo.transaction(fn ->
      group = lock(id)
      ids = member_ids(group)
      if device.id not in ids, do: Repo.rollback(:not_found)
      if device.id == group.owner_id, do: Repo.rollback(:owner_cannot_leave)

      Repo.delete_all(
        from m in "group_members", where: m.group_id == ^id and m.device_id == ^device.id
      )

      {Repo.preload(group, :members, force: true), ids}
    end)
    |> publish()
  end

  def with_recipient(sender, group_id, recipient_id, callback) do
    Repo.transaction(fn ->
      group = lock(group_id)
      ids = member_ids(group)

      if sender.id not in ids or recipient_id not in ids or sender.id == recipient_id,
        do: Repo.rollback(:recipient_not_found)

      case callback.(Repo.get!(Device, recipient_id)) do
        {:ok, transfer, recipient} -> {transfer, recipient}
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
    |> case do
      {:ok, {transfer, recipient}} -> {:ok, transfer, recipient}
      {:error, :not_found} -> {:error, :recipient_not_found}
      error -> error
    end
  end

  def json(group) do
    %{
      id: group.id,
      name: group.name,
      owner_id: group.owner_id,
      members: Enum.map(group.members, &Accounts.peer_json/1)
    }
  end

  defp member_query(device_id) do
    from g in Group,
      join: m in "group_members",
      on: m.group_id == g.id,
      where: m.device_id == ^device_id
  end

  defp lock(id) when is_binary(id) do
    group = Repo.one(from g in Group, where: g.id == ^id, lock: "FOR UPDATE")
    if is_nil(group), do: Repo.rollback(:not_found)
    Repo.preload(group, :members)
  end

  defp lock(_id), do: Repo.rollback(:not_found)

  defp member_ids(group), do: Enum.map(group.members, & &1.id)

  defp validate_members(device, ids, previous) when is_list(ids) do
    if length(ids) > 50 or not Enum.all?(ids, &is_binary/1),
      do: Repo.rollback(:invalid_members)

    ids = Enum.uniq([device.id | ids])
    if length(ids) > 50, do: Repo.rollback(:invalid_members)
    available = Enum.map(Accounts.list_peers(device), & &1.id)

    if Enum.any?(ids, &(&1 not in previous and &1 not in available)),
      do: Repo.rollback(:invalid_members)

    ids
  end

  defp validate_members(_device, _ids, _previous), do: Repo.rollback(:invalid_members)

  defp replace_members(group_id, ids) do
    Repo.delete_all(from m in "group_members", where: m.group_id == ^group_id)
    Repo.insert_all("group_members", Enum.map(ids, &%{group_id: group_id, device_id: &1}))
  end

  defp save(group, params) do
    case group |> Group.changeset(params) |> Repo.insert_or_update() do
      {:ok, saved} -> saved
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp publish({:ok, {group, ids}}) do
    for id <- ids, do: RoomEvents.notify_device(id, "groups_updated", %{group_id: group.id})
    {:ok, group}
  end

  defp publish(error), do: error
end
