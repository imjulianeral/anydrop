defmodule Phemera.Dashboard do
  @moduledoc """
  Numbers behind the dashboard: link activity from the daily usage counters,
  saved devices, and team figures for enterprise members.

  Scope decides which devices count. A guest sees the device they are on; a
  signed-in person sees every device saved to their account; `scope=team` adds
  every team member's saved devices.
  """
  import Ecto.Query

  alias Phemera.Accounts
  alias Phemera.Accounts.Device
  alias Phemera.Auth.User
  alias Phemera.DeviceOwnership
  alias Phemera.Repo
  alias Phemera.Sharing
  alias Phemera.Teams
  alias Phemera.Teams.Invitation
  alias Phemera.Teams.Member
  alias Phemera.Usage

  @ranges [7, 30, 90, 365]
  @default_range 30
  # A full heat calendar: 53 Monday-first weeks.
  @year_days 371
  @kinds ~w(url text file)

  @spec build(Device.t(), User.t() | nil, map()) :: map()
  def build(device, user, params) do
    days = parse_days(params["days"])
    {scope, device_ids, membership} = scope(device, user, params["scope"])

    today = Date.utc_today()
    start = Date.add(today, 1 - days)
    previous_start = Date.add(start, -days)
    year_start = Date.add(today, 1 - @year_days)

    rows = Usage.rows(device_ids, Enum.min([year_start, previous_start], Date), today)
    current = Enum.filter(rows, &in_range?(&1.day, start, today))
    previous = Enum.filter(rows, &in_range?(&1.day, previous_start, Date.add(start, -1)))

    %{
      scope: scope,
      days: days,
      start: Date.to_iso8601(start),
      end: Date.to_iso8601(today),
      daily: daily(current),
      year: year(Enum.filter(rows, &in_range?(&1.day, year_start, today))),
      totals: totals(current),
      previous: totals(previous),
      nearby: nearby(current),
      devices: user && devices(user),
      team: if(scope == "team", do: team(membership)),
      links: device_ids |> Sharing.list_short_links() |> Enum.map(&Sharing.short_link_json/1)
    }
  end

  defp parse_days(value) do
    days =
      case Integer.parse(to_string(value || "")) do
        {days, ""} -> days
        _other -> @default_range
      end

    if days in @ranges, do: days, else: @default_range
  end

  defp scope(device, nil, _requested), do: {"device", [device.id], nil}

  defp scope(device, user, requested) do
    own = own_device_ids(device, user)
    membership = requested == "team" && Teams.membership(user)

    if membership do
      teammate_devices =
        Repo.all(
          from d in Device,
            where: d.user_id in ^Teams.teammate_ids(user.id),
            select: d.id
        )

      {"team", Enum.uniq(own ++ teammate_devices), membership}
    else
      {"account", own, nil}
    end
  end

  # The current device counts toward the account unless it belongs to someone
  # else: signing in on a friend's device shouldn't pull in their links.
  defp own_device_ids(device, user) do
    owned = user |> DeviceOwnership.list_owned() |> Enum.map(& &1.id)

    if device.user_id in [nil, user.id],
      do: Enum.uniq([device.id | owned]),
      else: owned
  end

  defp in_range?(day, from, to),
    do: Date.compare(day, from) != :lt and Date.compare(day, to) != :gt

  defp daily(rows) do
    rows
    |> Enum.filter(&(&1.metric in ~w(created view download)))
    |> Enum.group_by(&{&1.day, &1.kind})
    |> Enum.map(fn {{day, kind}, group} ->
      Map.merge(%{day: Date.to_iso8601(day), kind: kind}, sums(group))
    end)
    |> Enum.sort_by(&{&1.day, &1.kind})
  end

  defp year(rows) do
    rows
    |> Enum.filter(&(&1.metric in ~w(view download)))
    |> Enum.group_by(& &1.day)
    |> Enum.map(fn {day, group} ->
      counts = sums(group)
      %{day: Date.to_iso8601(day), views: counts.views, downloads: counts.downloads}
    end)
    |> Enum.sort_by(& &1.day)
  end

  defp totals(rows) do
    by_kind =
      Map.new(@kinds, fn kind -> {kind, rows |> Enum.filter(&(&1.kind == kind)) |> sums()} end)

    Map.put(sums(rows), :by_kind, by_kind)
  end

  defp sums(rows) do
    %{
      created: count(rows, "created"),
      views: count(rows, "view"),
      downloads: count(rows, "download")
    }
  end

  defp count(rows, metric),
    do: rows |> Enum.filter(&(&1.metric == metric)) |> Enum.map(& &1.count) |> Enum.sum()

  defp bytes(rows, metric),
    do: rows |> Enum.filter(&(&1.metric == metric)) |> Enum.map(& &1.bytes) |> Enum.sum()

  defp nearby(rows) do
    daily =
      rows
      |> Enum.filter(&(&1.metric in ~w(sent received)))
      |> Enum.group_by(& &1.day)
      |> Enum.map(fn {day, group} ->
        %{
          day: Date.to_iso8601(day),
          sent: count(group, "sent"),
          received: count(group, "received")
        }
      end)
      |> Enum.sort_by(& &1.day)

    %{
      sent: count(rows, "sent"),
      received: count(rows, "received"),
      bytes_sent: bytes(rows, "sent"),
      bytes_received: bytes(rows, "received"),
      daily: daily
    }
  end

  defp devices(user) do
    owned = DeviceOwnership.list_owned(user)

    %{
      saved: length(owned),
      online: Enum.count(owned, &Accounts.online?/1),
      list: Enum.map(owned, &DeviceOwnership.device_json/1)
    }
  end

  defp team({team, role}) do
    members =
      Repo.all(
        from m in Member,
          where: m.team_id == ^team.id,
          order_by: [asc: m.inserted_at],
          select: {m.user_id, m.inserted_at}
      )

    member_ids = Enum.map(members, &elem(&1, 0))
    devices = Repo.all(from d in Device, where: d.user_id in ^member_ids)
    now = DateTime.utc_now()

    invitations =
      Repo.all(
        from i in Invitation,
          where: i.team_id == ^team.id,
          select: {i.status, i.expires_at}
      )

    %{
      name: team.name,
      role: role,
      members: length(members),
      pending_invitations:
        Enum.count(invitations, fn {status, expires_at} ->
          status == "pending" and DateTime.compare(expires_at, now) == :gt
        end),
      accepted_invitations: Enum.count(invitations, fn {status, _} -> status == "accepted" end),
      devices: length(devices),
      online_devices: Enum.count(devices, &Accounts.online?/1),
      growth: growth(members)
    }
  end

  # Cumulative member count on each day someone joined, ending today.
  defp growth(members) do
    points =
      members
      |> Enum.map(fn {_id, joined} -> DateTime.to_date(joined) end)
      |> Enum.frequencies()
      |> Enum.sort_by(&elem(&1, 0), Date)
      |> Enum.map_reduce(0, fn {day, joined}, total -> {{day, total + joined}, total + joined} end)
      |> elem(0)

    today = Date.utc_today()

    points =
      case List.last(points) do
        {^today, _total} -> points
        {_day, total} -> points ++ [{today, total}]
        nil -> []
      end

    Enum.map(points, fn {day, total} -> %{day: Date.to_iso8601(day), members: total} end)
  end
end
