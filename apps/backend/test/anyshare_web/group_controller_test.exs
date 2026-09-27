defmodule AnyshareWeb.GroupControllerTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Groups
  alias Anyshare.Repo
  alias Anyshare.Sharing
  alias Anyshare.SignalsFixture

  setup do
    {owner_token, owner} = device("Owner")
    {member_token, member} = device("Member")
    {other_token, other} = device("Other")
    {stranger_token, stranger} = device("Stranger", "elsewhere")

    %{
      owner: owner,
      owner_token: owner_token,
      member: member,
      member_token: member_token,
      other: other,
      other_token: other_token,
      stranger: stranger,
      stranger_token: stranger_token
    }
  end

  test "creates named groups, persists participants, and notifies members", c do
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{c.member.id}")

    response =
      request(c.owner_token, :post, "/api/v1/groups", %{
        name: "  Studio  ",
        member_ids: [c.member.id, c.member.id]
      })
      |> json_response(201)

    group = response["group"]
    assert group["name"] == "Studio"
    assert group["owner_id"] == c.owner.id

    assert Enum.sort(Enum.map(group["members"], & &1["id"])) ==
             Enum.sort([c.owner.id, c.member.id])

    assert_receive {:room_event, %{type: "groups_updated"}}

    assert [^group] =
             request(c.member_token, :get, "/api/v1/groups")
             |> json_response(200)
             |> Map.fetch!("groups")

    assert [] =
             request(c.stranger_token, :get, "/api/v1/groups")
             |> json_response(200)
             |> Map.fetch!("groups")
  end

  test "only the creator can rename, manage participants, or delete", c do
    {:ok, group} = group(c)
    path = "/api/v1/groups/#{group.id}"
    assert request(c.member_token, :patch, path, %{name: "Hijacked"}) |> json_response(404)
    assert request(c.stranger_token, :delete, path) |> json_response(404)
    assert request(c.member_token, :delete, path) |> json_response(404)

    updated =
      request(c.owner_token, :patch, path, %{name: "New name", member_ids: [c.other.id]})
      |> json_response(200)
      |> Map.fetch!("group")

    assert updated["name"] == "New name"

    assert Enum.sort(Enum.map(updated["members"], & &1["id"])) ==
             Enum.sort([c.owner.id, c.other.id])

    assert Groups.get(c.member, group.id) == nil
    assert response(request(c.owner_token, :delete, path), 204) == ""
    assert Groups.get(c.other, group.id) == nil
  end

  test "validates names and membership without exposing arbitrary devices", c do
    for name <- ["", "   ", String.duplicate("x", 81), nil, []] do
      assert request(c.owner_token, :post, "/api/v1/groups", %{name: name}) |> json_response(422)
    end

    for ids <- [
          [c.stranger.id],
          [Ecto.UUID.generate()],
          [nil],
          "bad",
          nil,
          List.duplicate(c.member.id, 51)
        ] do
      assert request(c.owner_token, :post, "/api/v1/groups", %{name: "Team", member_ids: ids})
             |> json_response(422)
    end

    {:ok, group} = group(c)

    assert {:error, :invalid_members} =
             Groups.update(c.owner, group.id, %{
               "name" => "Changed",
               "member_ids" => [c.stranger.id]
             })

    assert Groups.get(c.owner, group.id).name == "Team"
  end

  test "participants can leave while the creator stays included", c do
    {:ok, group} = group(c)
    path = "/api/v1/groups/#{group.id}/leave"
    assert request(c.owner_token, :post, path) |> json_response(422)
    assert request(c.stranger_token, :post, path) |> json_response(404)
    assert response(request(c.member_token, :post, path), 204) == ""
    assert Groups.get(c.member, group.id) == nil
    assert [%{id: id}] = Groups.get(c.owner, group.id).members
    assert id == c.owner.id
  end

  test "members can send encrypted text across networks, including to offline participants", c do
    {:ok, group} = group(c, [c.member.id, c.other.id])

    c.member
    |> Ecto.Changeset.change(ip_hash: "moved", last_seen_at: ~N[2020-01-01 00:00:00.000000])
    |> Repo.update!()

    assert Accounts.visible_peer(c.owner, c.member.id) == nil
    attrs = text_params(group.id, c.member.id) |> Map.merge(%{expires_in: 3600, max_downloads: 1})
    payload = request(c.owner_token, :post, "/api/v1/transfers", attrs) |> json_response(201)
    transfer = payload["transfer"]
    assert transfer["group_id"] == group.id
    assert transfer["max_downloads"] == 1
    assert transfer["secret"] == attrs.secret
    refute Map.has_key?(payload, "short_link")

    history =
      request(c.member_token, :get, "/api/v1/groups/#{group.id}/transfers") |> json_response(200)

    assert [item] = history["transfers"]
    refute Map.has_key?(item, "body")

    opened =
      request(c.member_token, :get, "/api/v1/transfers/#{transfer["id"]}") |> json_response(200)

    assert opened["transfer"]["body"] == attrs.body

    assert request(c.member_token, :get, "/api/v1/transfers/#{transfer["id"]}")
           |> json_response(404)

    assert request(c.member_token, :post, "/api/v1/transfers", text_params(group.id, c.other.id))
           |> json_response(201)
  end

  test "rejects outsiders, removed recipients, missing recipients, and self sends", c do
    {:ok, group} = group(c)

    assert request(
             c.stranger_token,
             :post,
             "/api/v1/transfers",
             text_params(group.id, c.member.id)
           )
           |> json_response(404)

    for recipient_id <- [c.stranger.id, c.owner.id, nil] do
      assert request(
               c.owner_token,
               :post,
               "/api/v1/transfers",
               text_params(group.id, recipient_id)
             )
             |> json_response(404)
    end

    assert request(c.owner_token, :post, "/api/v1/transfers", text_params("missing", c.member.id))
           |> json_response(404)

    {:ok, _} = Groups.leave(c.member, group.id)

    assert request(c.owner_token, :post, "/api/v1/transfers", text_params(group.id, c.member.id))
           |> json_response(404)

    assert request(c.member_token, :get, "/api/v1/groups/#{group.id}/transfers")
           |> json_response(404)
  end

  test "history reveals only the viewer's copies and keeps delivered items after deletion", c do
    {:ok, group} = group(c, [c.member.id, c.other.id])

    first =
      request(c.owner_token, :post, "/api/v1/transfers", text_params(group.id, c.member.id))
      |> json_response(201)
      |> Map.fetch!("transfer")

    request(c.owner_token, :post, "/api/v1/transfers", text_params(group.id, c.other.id))
    |> json_response(201)

    assert length(Sharing.list_group_transfers(c.owner, group.id)) == 2
    assert length(Sharing.list_group_transfers(c.member, group.id)) == 1
    assert request(c.other_token, :get, "/api/v1/transfers/#{first["id"]}") |> json_response(404)

    assert request(c.stranger_token, :get, "/api/v1/groups/#{group.id}/transfers")
           |> json_response(404)

    {:ok, _} = Groups.delete(c.owner, group.id)
    assert request(c.member_token, :get, "/api/v1/transfers/#{first["id"]}") |> json_response(200)
  end

  test "group transfers stay out of direct device history", c do
    {:ok, group} = group(c)

    group_transfer =
      request(c.owner_token, :post, "/api/v1/transfers", text_params(group.id, c.member.id))
      |> json_response(201)
      |> Map.fetch!("transfer")

    direct_transfer =
      request(
        c.owner_token,
        :post,
        "/api/v1/transfers",
        Map.delete(text_params(nil, c.member.id), :group_id)
      )
      |> json_response(201)
      |> Map.fetch!("transfer")

    for {token, peer_id} <- [
          {c.owner_token, c.member.id},
          {c.member_token, c.owner.id}
        ] do
      assert %{"transfers" => [%{"id" => direct_id}]} =
               request(token, :get, "/api/v1/transfers?peer_id=#{peer_id}")
               |> json_response(200)

      assert direct_id == direct_transfer["id"]

      assert %{"transfers" => [%{"id" => group_id}]} =
               request(token, :get, "/api/v1/groups/#{group.id}/transfers")
               |> json_response(200)

      assert group_id == group_transfer["id"]
    end

    {:ok, _} = Groups.delete(c.owner, group.id)

    assert %{"transfers" => [%{"id" => direct_id}]} =
             request(c.member_token, :get, "/api/v1/transfers?peer_id=#{c.owner.id}")
             |> json_response(200)

    assert direct_id == direct_transfer["id"]
  end

  test "group files use the existing upload, completion, and download flow", c do
    {:ok, group} = group(c)

    attrs =
      text_params(group.id, c.member.id)
      |> Map.delete(:body)
      |> Map.merge(%{
        kind: "file",
        filename: "secret.anyshare",
        content_type: "application/octet-stream",
        byte_size: 100
      })

    payload = request(c.owner_token, :post, "/api/v1/transfers", attrs) |> json_response(201)
    assert payload["upload"]["type"] == "single"
    id = payload["transfer"]["id"]

    completed =
      request(c.owner_token, :post, "/api/v1/transfers/#{id}/complete", %{
        "signals" => SignalsFixture.signals()
      })
      |> json_response(200)

    assert completed["transfer"]["group_id"] == group.id
    refute Map.has_key?(completed, "short_link")
    received = request(c.member_token, :get, "/api/v1/transfers/#{id}") |> json_response(200)
    assert received["download"]["url"] =~ "/api/v1/transfers/#{id}/download"
  end

  defp group(c, ids \\ nil),
    do: Groups.create(c.owner, %{"name" => "Team", "member_ids" => ids || [c.member.id]})

  defp device(name, network \\ "groups-test") do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp request(token, method, path, params \\ %{}) do
    build_conn()
    |> put_req_header("authorization", "Bearer #{token}")
    |> dispatch(@endpoint, method, path, params)
  end

  defp text_params(group_id, recipient_id) do
    %{
      group_id: group_id,
      recipient_id: recipient_id,
      kind: "text",
      body: Base.encode64(<<0::256>>),
      secret: %{
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
    }
  end
end
