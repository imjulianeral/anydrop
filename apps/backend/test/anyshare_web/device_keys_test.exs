defmodule AnyshareWeb.DeviceKeysTest do
  use AnyshareWeb.ConnCase, async: true
  alias Anyshare.Accounts

  test "publishes optional device keys and preserves them across old-tab boots" do
    id = Ecto.UUID.generate()
    key = Base.encode64(<<0x30, 0::720>>)
    {:ok, token, device} = Accounts.create_session(%{"id" => id, "public_key" => key}, "keys")
    assert Accounts.peer_json(device).public_key == key
    {:ok, _, reloaded} = Accounts.create_session(%{"id" => id}, "keys", token)
    assert reloaded.public_key == key
    {:ok, updated} = Accounts.update_device(reloaded, %{"public_key" => nil}, "keys")
    assert Accounts.peer_json(updated).public_key == nil

    for invalid <- [
          "invalid",
          Base.encode64(<<0::728>>),
          Base.encode64(<<0x30, 0::712>>),
          key <> "\n"
        ] do
      assert {:error, %Ecto.Changeset{}} =
               Accounts.update_device(reloaded, %{"public_key" => invalid}, "keys")
    end
  end
end
