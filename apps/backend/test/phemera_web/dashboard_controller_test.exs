defmodule PhemeraWeb.DashboardControllerTest do
  use PhemeraWeb.ConnCase, async: true

  alias Phemera.Accounts
  alias Phemera.Auth
  alias Phemera.Auth.User
  alias Phemera.Repo
  alias Phemera.Sharing
  alias Phemera.Teams
  alias Phemera.Teams.Member

  setup do
    Plug.CSRFProtection.delete_csrf_token()
    :ok
  end

  test "a guest sees only the device they're on" do
    {token, device} = device("Desk", "net-a")
    {_other_token, other} = device("Other", "net-b")
    view(device, "https://example.com/a")
    view(other, "https://example.com/b")

    body = get(guest(token), "/auth/dashboard?days=7") |> json_response(200)

    assert body["scope"] == "device"
    assert body["days"] == 7
    assert body["totals"]["views"] == 1
    assert body["totals"]["created"] == 1
    assert body["totals"]["by_kind"]["url"]["views"] == 1
    assert length(body["links"]) == 1
    assert body["devices"] == nil
    assert body["team"] == nil
    assert [%{"views" => 1}] = body["year"]
  end

  test "the device token is required" do
    assert get(build_conn(), "/auth/dashboard") |> json_response(401)
  end

  test "a signed-in person sees every saved device, but not another account's" do
    person = user("Person")
    {token, desk} = device("Desk", "net-a")
    {_token, laptop} = device("Laptop", "net-b")
    {_token, stranger} = device("Stranger", "net-c")
    save(desk, person)
    save(laptop, person)
    save(stranger, user("Someone else"))
    view(desk, "https://example.com/a")
    view(laptop, "https://example.com/b")
    view(stranger, "https://example.com/c")

    body = account(person, token, "/auth/dashboard?days=nope")

    assert body["scope"] == "account"
    assert body["days"] == 30
    assert body["totals"]["views"] == 2
    assert length(body["links"]) == 2
    assert body["devices"]["saved"] == 2
    assert body["devices"]["online"] == 2
  end

  test "team scope adds members' saved devices, growth and invitation counts" do
    owner = user("Owner", "enterprise")
    member = user("Member")
    {:ok, team} = Teams.create(owner, "Crew")
    Repo.insert!(%Member{team_id: team.id, user_id: member.id, role: "member"})
    {:ok, _invitation, _url} = Teams.invite(owner, "new@example.com")

    {token, desk} = device("Desk", "net-a")
    {_token, member_phone} = device("Phone", "net-b")
    save(desk, owner)
    save(member_phone, member)
    view(member_phone, "https://example.com/member")

    assert account(owner, token, "/auth/dashboard")["totals"]["views"] == 0

    body = account(owner, token, "/auth/dashboard?scope=team")
    assert body["scope"] == "team"
    assert body["totals"]["views"] == 1

    assert %{
             "name" => "Crew",
             "role" => "owner",
             "members" => 2,
             "pending_invitations" => 1,
             "accepted_invitations" => 0,
             "devices" => 2,
             "growth" => [%{"members" => 2}]
           } = body["team"]

    {outsider_token, outsider_device} = device("Solo", "net-c")
    outsider = user("Solo")
    save(outsider_device, outsider)
    assert account(outsider, outsider_token, "/auth/dashboard?scope=team")["scope"] == "account"
  end

  defp view(device, url) do
    {:ok, link} = Sharing.create_short_link(device, url)
    {:ok, _link} = Sharing.consume_short_link(link.code, "view")
  end

  defp save(device, user),
    do: device |> Ecto.Changeset.change(user_id: user.id) |> Repo.update!()

  defp user(name, plan \\ "free"), do: Repo.insert!(%User{name: name, plan: plan})

  defp device(name, network) do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp guest(device_token), do: put_req_header(build_conn(), "x-device-token", device_token)

  defp account(user, device_token, path) do
    token = Auth.issue_token("session", user.id)

    build_conn()
    |> init_test_session(account_token: token)
    |> put_req_header("x-device-token", device_token)
    |> get(path)
    |> json_response(200)
  end
end
