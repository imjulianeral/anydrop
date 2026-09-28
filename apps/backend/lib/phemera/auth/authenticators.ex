defmodule Phemera.Auth.Authenticators do
  @moduledoc """
  Friendly names for passkey providers, keyed by the AAGUID the authenticator
  reports at registration. Sourced from the community passkey AAGUID list:
  https://github.com/passkeydeveloper/passkey-authenticator-aaguids
  """

  @names %{
    "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4" => "Google Password Manager",
    "adce0002-35bc-c60a-648b-0b25f1f05503" => "Chrome on Mac",
    "fbfc3007-154e-4ecc-8c0b-6e020557d7bd" => "iCloud Keychain",
    "dd4ec289-e01d-41c9-bb89-70fa845d4bf2" => "iCloud Keychain",
    "08987058-cadc-4b81-b6e1-30de50dcbe96" => "Windows Hello",
    "9ddd1817-af5a-4672-a2b9-3e3dd95000a9" => "Windows Hello",
    "6028b017-b1d4-4c02-b4b3-afcdafc96bb2" => "Windows Hello",
    "bada5566-a7aa-401f-bd96-45619a55120d" => "1Password",
    "d548826e-79b4-db40-a3d8-11116f7e8349" => "Bitwarden",
    "531126d6-e717-415c-9320-3d9aa6981239" => "Dashlane",
    "b84e4048-15dc-4dd0-8640-f4f60813c8af" => "NordPass",
    "50726f74-6f6e-5061-7373-50726f746f6e" => "Proton Pass",
    "fdb141b2-5d84-443e-8a35-4698c205a502" => "KeePassXC",
    "53414d53-554e-4700-0000-000000000000" => "Samsung Pass",
    "cb69481e-8ff7-4039-93ec-0a2729a154a8" => "YubiKey 5",
    "ee882879-721c-4913-9775-3dfcce97072a" => "YubiKey 5",
    "fa2b99dc-9e39-4257-8f92-4a30d23c4118" => "YubiKey 5 NFC",
    "2fc0579f-8113-47ea-b116-bb5a8db9202a" => "YubiKey 5 NFC",
    "c5ef55ff-ad9a-4b9f-b580-adebafe026d0" => "YubiKey 5Ci",
    "73bb0cd4-e502-49b8-9c6f-b59445bf720b" => "YubiKey 5 FIPS",
    "d8522d9f-575b-4866-88a9-ba99fa02f35b" => "YubiKey Bio",
    "83c47309-aabb-4108-8470-8be838b573cb" => "YubiKey Bio",
    "149a2021-8ef6-4133-96b8-81f8d5b7f1f5" => "Security Key by Yubico",
    "a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa" => "Security Key NFC by Yubico",
    "0bb43545-fd2c-4185-87dd-feb0b2916ace" => "Security Key NFC by Yubico"
  }

  @hardware_transports ["usb", "nfc", "ble", "smart-card"]

  @doc "Names a new passkey from its AAGUID, falling back to how it was created."
  def name(aaguid, authenticator, transports) do
    cond do
      name = Map.get(@names, aaguid) -> name
      authenticator == :security_key -> "Security key"
      transports != [] and Enum.all?(transports, &(&1 in @hardware_transports)) -> "Security key"
      true -> "Passkey"
    end
  end
end
