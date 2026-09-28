defmodule PhemeraWeb.TeamControllerTest do
  use PhemeraWeb.ConnCase, async: true

  import Swoosh.TestAssertions

  alias Phemera.Accounts
  alias Phemera.Accounts.Device
  alias Phemera.Auth
  alias Phemera.Auth.User
  alias Phemera.DeviceOwnership
  alias Phemera.Repo
  alias Phemera.Sharing
  alias Phemera.Teams
  alias Phemera.Teams.Invitation

  setup do
    Plug.CSRFProtection.delete_csrf_token()
    :ok
  end

  test "only enterprise accounts create teams" do
    free = account(user("Free", "free"))
    assert request(free, :post, "/auth/team", %{name: "Crew"}) |> json_response(403)

    owner = account(user("Owner", "enterprise"))
    team = request(owner, :post, "/auth/team", %{name: "Crew"}) |> json_response(201)

    assert %{"name" => "Crew", "role" => "owner", "members" => [%{"role" => "owner"}]} =
             team["team"]

    assert request(owner, :post, "/auth/team", %{name: "Again"}) |> json_response(409)

    session = request(owner, :get, "/auth/session") |> json_response(200)
    assert session["user"]["plan"] == "enterprise"
    assert session["user"]["team"]["name"] == "Crew"
  end

  test "an emailed invitation creates membership once" do
    owner_user = user("Owner", "enterprise")
    owner = account(owner_user)
    request(owner, :post, "/auth/team", %{name: "Crew"}) |> json_response(201)

    assert request(owner, :post, "/auth/team/invitations", %{email: "nope"}) |> json_response(422)

    body =
      request(owner, :post, "/auth/team/invitations", %{email: " New.Person@Example.com "})
      |> json_response(201)

    assert body["invitation"]["email"] == "new.person@example.com"
    "/join/" <> token = URI.parse(body["url"]).path

    assert_email_sent(fn email ->
      assert email.to == [{"", "new.person@example.com"}]
      assert email.subject =~ "Crew"
      assert email.text_body =~ body["url"]
      assert email.html_body =~ "Accept invitation"
    end)

    preview = get(build_conn(), "/auth/team/join/#{token}") |> json_response(200)
    assert preview["invitation"]["team"] == "Crew"
    assert preview["invitation"]["invited_by"] == "Owner"
    assert preview["invitation"]["email"] == "n•••@example.com"

    newcomer = Repo.insert!(%User{name: "New"})
    joined = account(newcomer)
    assert request(joined, :post, "/auth/team/join/#{token}") |> json_response(200)
    assert Repo.get!(User, newcomer.id).email == "new.person@example.com"
    assert request(joined, :post, "/auth/team/join/#{token}") |> json_response(404)
    assert get(build_conn(), "/auth/team/join/#{token}") |> json_response(404)

    team = request(joined, :get, "/auth/team") |> json_response(200)
    assert team["team"]["role"] == "member"
    assert team["team"]["invitations"] == []
    assert length(team["team"]["members"]) == 2

    assert request(joined, :post, "/auth/team/invitations", %{email: "x@example.com"})
           |> json_response(403)
  end

  test "invitations expire, can be revoked, and can't be reused by another team member" do
    owner = account(user("Owner", "enterprise"))
    request(owner, :post, "/auth/team", %{name: "Crew"}) |> json_response(201)

    first =
      request(owner, :post, "/auth/team/invitations", %{email: "a@example.com"})
      |> json_response(201)

    request(owner, :delete, "/auth/team/invitations/#{first["invitation"]["id"]}")
    |> json_response(200)

    assert get(
             build_conn(),
             URI.parse(first["url"]).path |> String.replace("/join/", "/auth/team/join/")
           )
           |> json_response(404)

    second =
      request(owner, :post, "/auth/team/invitations", %{email: "b@example.com"})
      |> json_response(201)

    Repo.update_all(Invitation, set: [expires_at: DateTime.add(DateTime.utc_now(), -1)])
    "/join/" <> token = URI.parse(second["url"]).path
    assert request(account(user("Late")), :post, "/auth/team/join/#{token}") |> json_response(404)
  end

  test "teammates reach each other's saved devices and the team group" do
    owner = user("Owner", "enterprise")
    member = user("Member")
    {:ok, team} = Teams.create(owner, "Crew")

    {owner_token, owner_device} = device("Owner laptop", "office")
    {_member_token, member_device} = device("Member phone", "home")
    {_token, outsider} = device("Outsider", "cafe")
    {:ok, owner_device} = DeviceOwnership.save_current(owner, owner_device, nil)
    {:ok, member_device} = DeviceOwnership.save_current(member, member_device, nil)

    assert Accounts.visible_peer(owner_device, member_device.id) == nil

    {:ok, _invitation, url} = Teams.invite(owner, "member@example.com")
    "/join/" <> token = URI.parse(url).path
    assert {:ok, %{id: team_id}} = Teams.accept(member, token)
    assert team_id == team.id

    assert Accounts.visible_peer(owner_device, member_device.id).id == member_device.id
    assert Accounts.visible_peer(member_device, owner_device.id).id == owner_device.id
    assert Accounts.visible_peer(outsider, member_device.id) == nil
    assert [%{relation: "team"}] = Accounts.peers_json(owner_device)

    groups =
      build_conn()
      |> put_req_header("authorization", "Bearer #{owner_token}")
      |> get("/api/v1/groups")
      |> json_response(200)
      |> Map.fetch!("groups")

    assert [%{"id" => "team:" <> _ = group_id, "kind" => "team", "members" => members}] = groups

    assert Enum.sort(Enum.map(members, & &1["id"])) ==
             Enum.sort([owner_device.id, member_device.id])

    assert {:ok, transfer, recipient} = group_text(owner_device, group_id, member_device)
    assert transfer.group_id == group_id
    assert recipient.id == member_device.id
    assert {:error, :recipient_not_found} = group_text(owner_device, group_id, outsider)
    assert {:error, :recipient_not_found} = group_text(outsider, group_id, member_device)

    assert Teams.remove_member(owner, member.id) == :ok
    assert Accounts.visible_peer(owner_device, member_device.id) == nil
    assert Repo.get!(Device, member_device.id).user_id == member.id
  end

  test "members leave, owners can't, and owners delete the team" do
    owner = user("Owner", "enterprise")
    member = user("Member")
    {:ok, _team} = Teams.create(owner, "Crew")
    {:ok, _invitation, url} = Teams.invite(owner, "m@example.com")

    {:ok, _team} =
      Teams.accept(
        member,
        url |> URI.parse() |> Map.fetch!(:path) |> String.replace_prefix("/join/", "")
      )

    assert request(account(owner), :post, "/auth/team/leave") |> json_response(422)
    assert request(account(member), :post, "/auth/team/leave") |> json_response(200)
    assert Teams.membership(member) == nil
    assert request(account(owner), :delete, "/auth/team") |> json_response(200)
    assert Teams.membership(owner) == nil
  end

  defp user(name, plan \\ "free"), do: Repo.insert!(%User{name: name, plan: plan})

  defp device(name, network) do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp group_text(sender, group_id, recipient) do
    Sharing.create_transfer(sender, %{
      "recipient_id" => recipient.id,
      "group_id" => group_id,
      "kind" => "text",
      "body" => Base.encode64(:crypto.strong_rand_bytes(32)),
      "secret" => %{
        "version" => 3,
        "kdf" => "hkdf-sha256",
        "password" => false,
        "cipher" => "aes-256-gcm",
        "iv" => Base.encode64(<<0::96>>),
        "wrap" => %{
          "alg" => "ecdh-p256-hkdf-aes-gcm",
          "ephemeral_public" => Base.encode64(<<0x30, 0::720>>),
          "iv" => Base.encode64(<<0::96>>),
          "ciphertext" => Base.encode64(<<0::384>>)
        }
      }
    })
  end

  defp account(user) do
    token = Auth.issue_token("session", user.id)
    conn = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    {conn, json_response(conn, 200)["csrf_token"]}
  end

  defp request({conn, csrf}, method, path, body \\ %{}) do
    conn
    |> recycle()
    |> put_private(:plug_skip_csrf_protection, false)
    |> put_req_header("origin", Auth.origin())
    |> put_req_header("x-csrf-token", csrf)
    |> dispatch(@endpoint, method, path, body)
  end
end
