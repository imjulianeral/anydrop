defmodule AnyshareWeb.InvitationControllerTest do
  use AnyshareWeb.ConnCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Invitation
  alias Anyshare.Invitations
  alias Anyshare.Repo
  alias Anyshare.RoomEvents
  alias Anyshare.Sharing
  alias Anyshare.SignalsFixture
  alias Anyshare.Time

  test "remote devices remain hidden until an exact-name invitation is accepted" do
    {sender_token, sender} = device("Sender", "network-a")
    {recipient_token, recipient} = device("Remote Fox", "network-b")
    {_token, nearby} = device("Nearby", "network-a")
    {_token, stranger} = device("Stranger", "network-c")

    assert Enum.map(Accounts.list_peers(sender), & &1.id) == [nearby.id]
    assert {:error, :recipient_not_found} = transfer(sender, recipient)

    response = request(sender_token, :post, "/api/v1/invitations", %{target: "Remote Fox"})
    invitation = json_response(response, 201)["invitation"]
    assert invitation["recipient"]["id"] == recipient.id
    assert invitation["status"] == "pending"
    assert Accounts.visible_peer(sender, recipient.id) == nil

    assert {:error, :not_found} = Invitations.respond(sender, invitation["id"], "accept")
    assert {:error, :not_found} = Invitations.respond(stranger, invitation["id"], "accept")

    response =
      request(recipient_token, :patch, "/api/v1/invitations/#{invitation["id"]}", %{
        action: "accept"
      })

    assert json_response(response, 200)["invitation"]["status"] == "accepted"
    assert Accounts.visible_peer(sender, recipient.id).id == recipient.id
    assert Accounts.visible_peer(recipient, sender.id).id == sender.id
    assert Accounts.visible_peer(stranger, recipient.id) == nil
    assert Accounts.visible_peer(sender, nearby.id).id == nearby.id
    assert {:ok, text, _} = transfer(sender, recipient)
    assert {:ok, _, _} = transfer(recipient, sender)

    file_response =
      request(sender_token, :post, "/api/v1/transfers", %{
        recipient_id: recipient.id,
        kind: "file",
        filename: "secret.anyshare",
        byte_size: 100,
        content_type: "application/octet-stream",
        secret: text.secret
      })
      |> json_response(201)

    assert file_response["transfer"]["recipient_id"] == recipient.id
    assert file_response["upload"]["type"] == "single"

    completed =
      request(
        sender_token,
        :post,
        "/api/v1/transfers/#{file_response["transfer"]["id"]}/complete",
        %{"signals" => SignalsFixture.signals()}
      )
      |> json_response(200)

    assert completed["transfer"]["status"] == "uploaded"

    assert {:error, :not_found} = Invitations.respond(stranger, invitation["id"], "disconnect")
    assert {:ok, _} = Invitations.respond(sender, invitation["id"], "disconnect")
    assert {:error, :recipient_not_found} = transfer(sender, recipient)
    assert Accounts.visible_peer(sender, nearby.id).id == nearby.id
  end

  test "lookup rejects missing, partial, wrong-case, duplicate, self and offline targets" do
    {token, sender} = device("Sender", "a")
    {_token, first} = device("Amber Fox", "b")
    {_token, _second} = device("Amber Fox", "c")
    {_token, offline} = device("Offline", "d")

    offline
    |> Ecto.Changeset.cast(%{last_seen_at: NaiveDateTime.add(Time.now(), -121)}, [:last_seen_at])
    |> Repo.update!()

    for target <- ["Missing", "Amber", "amber fox"] do
      assert request(token, :post, "/api/v1/invitations", %{target: target}) |> json_response(404)
    end

    assert {:error, :ambiguous} = Invitations.create(sender, "Amber Fox")
    assert {:error, :self_invite} = Invitations.create(sender, sender.id)
    assert {:error, :offline} = Invitations.create(sender, offline.id)
    assert {:error, :invalid_target} = Invitations.create(sender, %{})
    assert {:error, :invalid_target} = Invitations.create(sender, "  ")
    assert {:ok, invitation} = Invitations.create(sender, first.id)
    assert invitation.recipient_id == first.id
  end

  test "a nickname cannot shadow a user ID and accepted devices must still be online" do
    {_token, sender} = device("Sender", "a")
    {_token, recipient} = device("Recipient", "b")
    device(recipient.id, "c")
    {:ok, invitation} = Invitations.create(sender, recipient.id)
    assert invitation.recipient_id == recipient.id
    {:ok, _} = Invitations.respond(recipient, invitation.id, "accept")
    assert {:error, :already_connected} = Invitations.create(sender, recipient.id)

    recipient
    |> Ecto.Changeset.cast(%{last_seen_at: NaiveDateTime.add(Time.now(), -121)}, [:last_seen_at])
    |> Repo.update!()

    assert Accounts.visible_peer(sender, recipient.id) == nil
    assert {:error, :recipient_not_found} = transfer(sender, recipient)
  end

  test "duplicates in either direction do not bypass consent; decline and expiry deny transfers" do
    {_token, sender} = device("Sender", "a")
    {_token, recipient} = device("Recipient", "b")
    {:ok, invitation} = Invitations.create(sender, recipient.id)
    assert {:error, :already_pending} = Invitations.create(sender, recipient.id)
    assert {:error, :already_pending} = Invitations.create(recipient, sender.id)
    assert {:ok, _} = Invitations.respond(recipient, invitation.id, "decline")
    assert {:error, :recipient_not_found} = transfer(sender, recipient)
    assert {:error, :already_answered} = Invitations.respond(recipient, invitation.id, "accept")
    assert {:error, :rate_limited} = Invitations.create(sender, recipient.id)

    Repo.get!(Invitation, invitation.id)
    |> Ecto.Changeset.cast(%{status: "pending", expires_at: NaiveDateTime.add(Time.now(), -1)}, [
      :status,
      :expires_at
    ])
    |> Repo.update!()

    assert Invitations.list(recipient) == []
    assert {:error, :expired} = Invitations.respond(recipient, invitation.id, "accept")
    assert {:error, :recipient_not_found} = transfer(sender, recipient)
  end

  test "pending invites survive refresh and only participants can list them" do
    {sender_token, sender} = device("Sender", "a")
    {recipient_token, recipient} = device("Recipient", "b")
    {other_token, _other} = device("Other", "c")
    {:ok, invitation} = Invitations.create(sender, recipient.id)

    for token <- [sender_token, recipient_token] do
      response = request(token, :get, "/api/v1/invitations", %{}) |> json_response(200)
      assert [%{"id" => id}] = response["invitations"]
      assert id == invitation.id
    end

    assert request(other_token, :get, "/api/v1/invitations", %{}) |> json_response(200) == %{
             "invitations" => []
           }

    assert build_conn()
           |> post("/api/v1/invitations", %{target: recipient.id})
           |> json_response(401)
  end

  test "invitations and remote presence use device topics; transfers never broadcast to the room" do
    {_token, sender} = device("Sender", "a")
    {_token, recipient} = device("Recipient", "b")
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{sender.id}")
    {:ok, invitation} = Invitations.create(sender, recipient.id)
    assert_receive {:room_event, %{type: "invitation_updated", invitation: %{status: "pending"}}}
    {:ok, _} = Invitations.respond(recipient, invitation.id, "accept")
    assert_receive {:room_event, %{type: "invitation_updated", invitation: %{status: "accepted"}}}
    RoomEvents.broadcast(recipient, "peer_joined", Accounts.peer_json(recipient))
    assert_receive {:room_event, %{type: "peer_joined"}}
    RoomEvents.broadcast(recipient, "peer_left", %{id: recipient.id})
    assert_receive {:room_event, %{type: "peer_left"}}

    Phoenix.PubSub.unsubscribe(Anyshare.PubSub, "device:#{sender.id}")
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "room:ip:#{recipient.ip_hash}")
    {:ok, text, _} = transfer(sender, recipient)
    Sharing.deliver_text(text, recipient)
    refute_receive {:room_event, _}
    Phoenix.PubSub.subscribe(Anyshare.PubSub, "device:#{recipient.id}")
    Sharing.deliver_text(text, recipient)
    assert_receive {:room_event, %{type: "text_received"}}
  end

  defp device(name, network) do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp transfer(sender, recipient) do
    Sharing.create_transfer(sender, %{
      "recipient_id" => recipient.id,
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

  defp request(token, method, path, params) do
    conn = build_conn() |> put_req_header("authorization", "Bearer #{token}")
    dispatch(conn, @endpoint, method, path, params)
  end
end
