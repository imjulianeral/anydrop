defmodule Anyshare.Rooms do
  @moduledoc false

  import Plug.Conn, only: [get_req_header: 2]

  @spec ip_hash(String.t()) :: String.t()
  def ip_hash(ip), do: :crypto.hash(:sha256, ip) |> Base.encode16(case: :lower)

  @spec connecting_ip(Plug.Conn.t()) :: String.t()
  def connecting_ip(conn) do
    case get_req_header(conn, "cf-connecting-ip") do
      [address | _rest] -> address
      [] -> conn.remote_ip |> :inet.ntoa() |> to_string()
    end
  end

  @spec generate_code() :: String.t()
  def generate_code, do: random_alphanumeric(6)

  @spec normalize_code(term()) :: String.t() | nil
  def normalize_code(nil), do: nil

  def normalize_code(value) do
    normalized =
      value
      |> to_string()
      |> String.upcase()
      |> String.replace(~r/[^A-Z0-9]/u, "")

    if normalized == "", do: nil, else: normalized
  end

  defp random_alphanumeric(length) do
    length
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
    |> String.replace(~r/[^A-Za-z0-9]/u, "")
    |> String.pad_trailing(length, "0")
    |> binary_part(0, length)
    |> String.upcase()
  end
end
