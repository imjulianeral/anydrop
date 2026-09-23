defmodule Anyshare.Sharing.DownloadUrlTest do
  use Anyshare.DataCase, async: true

  alias Anyshare.Accounts
  alias Anyshare.Repo
  alias Anyshare.Sharing

  test "file download URLs ask the browser to save the file" do
    {:ok, _token, device} =
      Accounts.create_session(%{"id" => Ecto.UUID.generate()}, "download-url")

    {:ok, transfer, _recipient} =
      Sharing.create_transfer(device, %{
        "kind" => "file",
        "filename" => "secret.anyshare",
        "byte_size" => 100,
        "content_type" => "application/octet-stream",
        "secret" => %{
          "version" => 3,
          "kdf" => "hkdf-sha256",
          "password" => false,
          "cipher" => "aes-256-gcm",
          "iv" => Base.encode64(<<0::96>>)
        }
      })

    {:ok, transfer} = Sharing.complete_transfer(device, transfer.id)
    {:ok, link} = Sharing.mint_short_link(device, transfer)
    link = Repo.preload(link, :transfer)

    payload = Sharing.transfer_json(transfer, device, download: true)
    assert payload.download.url =~ "/api/v1/transfers/#{transfer.id}/download?token="

    link_payload = Sharing.short_link_json(link)
    assert link_payload.download.url == "/api/v1/short_links/#{link.code}/download"
  end
end
