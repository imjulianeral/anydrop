defmodule Anyshare.Sharing.ShortLinkTest do
  use ExUnit.Case, async: true

  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Time

  test "accepts HTTP URLs" do
    changeset =
      ShortLink.changeset(%ShortLink{}, %{
        code: "ABC1234",
        target_url: "https://example.com/path",
        expires_at: Time.now(),
        created_at: Time.now()
      })

    assert changeset.valid?
  end

  test "rejects non-HTTP URLs" do
    changeset =
      ShortLink.changeset(%ShortLink{}, %{
        code: "ABC1234",
        target_url: "javascript:alert(1)",
        expires_at: Time.now(),
        created_at: Time.now()
      })

    refute changeset.valid?
    assert {"must be an http or https URL", _metadata} = changeset.errors[:target_url]
  end
end
