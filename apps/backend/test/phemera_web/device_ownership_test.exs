defmodule PhemeraWeb.DeviceOwnershipTest do
  use PhemeraWeb.ConnCase, async: true

  alias Phemera.Accounts
  alias Phemera.Accounts.Device
  alias Phemera.Auth
  alias Phemera.Auth.User
  alias Phemera.DeviceOwnership
  alias Phemera.Repo
  alias Phemera.RoomEvents

  setup do
    Plug.CSRFProtection.delete_csrf_token()
    :ok
  end

  test "a nearby device joins an account only after it confirms" do
    owner = user("Owner")
    {owner_token, laptop} = device("Amber Fox", "home")
    {target_token, target} = device("Quiet Owl", "home")
    {_token, stranger} = device("Stranger", "cafe")
    Phoenix.PubSub.subscribe(Phemera.PubSub, "device:#{target.id}")

    browser = account(owner)

    assert account_request(browser, :post, "/auth/devices/current", owner_token)
           |> json_response(200)

    claim =
      account_request(browser, :post, "/auth/devices/claims", owner_token, %{
        device_id: target.id,
        name: "Work laptop"
      })
      |> json_response(201)
      |> Map.fetch!("claim")

    assert claim["requester"]["name"] == "Owner"
    assert_receive {:room_event, %{type: "device_claim_updated"}}
    assert Repo.get!(Device, target.id).user_id == nil

    pending = device_request(target_token, :get, "/api/v1/device_claims") |> json_response(200)
    assert [%{"id" => id, "name" => "Work laptop"}] = pending["claims"]
    assert {:error, :not_found} = DeviceOwnership.respond_claim(stranger, id, "accept")
    assert {:error, :not_found} = DeviceOwnership.respond_claim(laptop, id, "accept")

    accepted =
      device_request(target_token, :patch, "/api/v1/device_claims/#{id}", %{action: "accept"})
      |> json_response(200)

    assert accepted["claim"]["status"] == "accepted"
    saved = Repo.get!(Device, target.id)
    assert saved.user_id == owner.id
    assert saved.display_name == "Work laptop"
    assert_receive {:room_event, %{type: "self_updated", device: %{display_name: "Work laptop"}}}

    # The saved device stays reachable after it moves to another network.
    {:ok, _token, moved} =
      Accounts.create_session(
        %{"id" => target.id, "display_name" => "Quiet Owl"},
        "office",
        target_token
      )

    assert moved.display_name == "Work laptop"
    laptop = Repo.get!(Device, laptop.id)
    assert Accounts.visible_peer(laptop, target.id).id == target.id
    assert Accounts.visible_peer(stranger, target.id) == nil
    assert [%{id: target_id, relation: "mine", saved: true}] = Accounts.peers_json(laptop)

    assert target_id == target.id
  end

  test "strangers elsewhere and devices on another account cannot be claimed" do
    owner = user("Owner")
    other = user("Other")
    {owner_token, _laptop} = device("Laptop", "home")
    {_token, remote} = device("Remote", "elsewhere")
    {other_token, friend} = device("Friend", "home")

    browser = account(owner)
    account_request(browser, :post, "/auth/devices/current", owner_token) |> json_response(200)

    assert account_request(browser, :post, "/auth/devices/claims", owner_token, %{
             device_id: remote.id,
             name: "Remote"
           })
           |> json_response(404)

    account(other)
    |> account_request(:post, "/auth/devices/current", other_token)
    |> json_response(200)

    assert account_request(browser, :post, "/auth/devices/claims", owner_token, %{
             device_id: friend.id,
             name: "Mine now"
           })
           |> json_response(409)

    # Signing in to your account on a friend's device never takes it over.
    assert account_request(browser, :post, "/auth/devices/current", other_token)
           |> json_response(409)

    assert Repo.get!(Device, friend.id).user_id == other.id
  end

  test "signing in recognises saved devices without claiming unsaved ones" do
    owner = user("Owner")
    other = user("Other")
    {own_token, own} = device("Own", "home")
    {friend_token, friend} = device("Friend", "home")
    {other_token, _theirs} = device("Theirs", "home")

    browser = account(owner)
    assert current_status(browser, friend_token) == "unsaved"
    assert Repo.get!(Device, friend.id).user_id == nil

    account_request(browser, :post, "/auth/devices/current", own_token, %{name: "Desk"})
    |> json_response(200)

    assert current_status(browser, own_token) == "mine"

    account(other)
    |> account_request(:post, "/auth/devices/current", other_token)
    |> json_response(200)

    assert current_status(browser, other_token) == "other_account"

    body = account_request(browser, :get, "/auth/devices") |> json_response(200)
    assert body["current"] == nil
    assert [%{"id" => own_id, "display_name" => "Desk", "online" => true}] = body["devices"]
    assert own_id == own.id
  end

  test "owners rename and remove saved devices, and devices can't rename themselves" do
    owner = user("Owner")
    {token, device} = device("Laptop", "home")
    browser = account(owner)
    account_request(browser, :post, "/auth/devices/current", token) |> json_response(200)

    assert account_request(browser, :patch, "/auth/devices/#{device.id}", nil, %{name: "  "})
           |> json_response(422)

    assert account_request(browser, :patch, "/auth/devices/#{device.id}", nil, %{name: "Studio"})
           |> json_response(200)

    device_request(token, :patch, "/api/v1/device", %{display_name: "Sneaky"})
    |> json_response(200)

    assert Repo.get!(Device, device.id).display_name == "Studio"

    account(user("Stranger"))
    |> account_request(:delete, "/auth/devices/#{device.id}")
    |> json_response(404)

    assert account_request(browser, :delete, "/auth/devices/#{device.id}") |> json_response(200)
    removed = Repo.get!(Device, device.id)
    assert removed.user_id == nil
    assert removed.display_name == "Studio"
  end

  test "a second account waits for a pending request, and declining leaves the device alone" do
    first = user("First")
    second = user("Second")
    {first_token, _} = device("First", "home")
    {second_token, _} = device("Second", "home")
    {target_token, target} = device("Target", "home")

    first_browser = account(first)
    second_browser = account(second)

    for {browser, token} <- [{first_browser, first_token}, {second_browser, second_token}] do
      account_request(browser, :post, "/auth/devices/current", token) |> json_response(200)
    end

    claim =
      account_request(first_browser, :post, "/auth/devices/claims", first_token, %{
        device_id: target.id,
        name: "Target"
      })
      |> json_response(201)
      |> Map.fetch!("claim")

    assert account_request(second_browser, :post, "/auth/devices/claims", second_token, %{
             device_id: target.id,
             name: "Target"
           })
           |> json_response(409)

    device_request(target_token, :patch, "/api/v1/device_claims/#{claim["id"]}", %{
      action: "decline"
    })
    |> json_response(200)

    assert Repo.get!(Device, target.id).user_id == nil

    assert device_request(target_token, :patch, "/api/v1/device_claims/#{claim["id"]}", %{
             action: "accept"
           })
           |> json_response(409)
  end

  test "account device routes need a session and a device token" do
    {token, _device} = device("Laptop", "home")
    conn = get(build_conn(), "/auth/session")
    csrf = json_response(conn, 200)["csrf_token"]
    assert account_request({conn, csrf}, :get, "/auth/devices", token) |> json_response(401)

    browser = account(user("Owner"))

    assert account_request(browser, :post, "/auth/devices/current", "not-a-token")
           |> json_response(401)
  end

  test "presence events reach the owner's devices on other networks" do
    owner = user("Owner")
    {token, laptop} = device("Laptop", "home")
    {phone_token, phone} = device("Phone", "home")
    browser = account(owner)
    account_request(browser, :post, "/auth/devices/current", token) |> json_response(200)
    account_request(browser, :post, "/auth/devices/current", phone_token) |> json_response(200)

    {:ok, _token, phone} =
      Accounts.create_session(%{"id" => phone.id}, "cellular", phone_token)

    Phoenix.PubSub.subscribe(Phemera.PubSub, "device:#{phone.id}")
    RoomEvents.broadcast(Repo.get!(Device, laptop.id), "peer_updated", %{id: laptop.id})
    assert_receive {:room_event, %{type: "peer_updated", id: id}}
    assert id == laptop.id
  end

  test "return paths stay on this site" do
    assert Auth.safe_return_to("/join/abc") == "/join/abc"
    assert Auth.safe_return_to("/links?tab=1") == "/links?tab=1"
    refute Auth.safe_return_to("//evil.example")
    refute Auth.safe_return_to("/\\evil.example")
    refute Auth.safe_return_to("https://evil.example/")
    refute Auth.safe_return_to("javascript:alert(1)")
    refute Auth.safe_return_to("/ok\nSet-Cookie: x")
    refute Auth.safe_return_to(nil)
  end

  defp user(name), do: Repo.insert!(%User{name: name})

  defp device(name, network) do
    {:ok, token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate(), "display_name" => name}, network)

    {token, device}
  end

  defp current_status(browser, device_token) do
    browser
    |> account_request(:get, "/auth/devices", device_token)
    |> json_response(200)
    |> get_in(["current", "status"])
  end

  defp account(user) do
    token = Auth.issue_token("session", user.id)
    conn = build_conn() |> init_test_session(account_token: token) |> get("/auth/session")
    {conn, json_response(conn, 200)["csrf_token"]}
  end

  defp account_request({conn, csrf}, method, path, device_token \\ nil, body \\ %{}) do
    conn =
      conn
      |> recycle()
      |> put_private(:plug_skip_csrf_protection, false)
      |> put_req_header("origin", Auth.origin())
      |> put_req_header("x-csrf-token", csrf)

    conn = if device_token, do: put_req_header(conn, "x-device-token", device_token), else: conn
    dispatch(conn, @endpoint, method, path, body)
  end

  defp device_request(token, method, path, params \\ %{}) do
    build_conn()
    |> put_req_header("authorization", "Bearer #{token}")
    |> dispatch(@endpoint, method, path, params)
  end
end
