defmodule Anyshare.Sharing.LinkPassword do
  @moduledoc false

  @iterations 600_000
  @salt_bytes 16
  @hash_bytes 32

  @spec valid?(term()) :: boolean()
  def valid?(password) when is_binary(password) do
    count = password |> String.trim() |> String.length()
    count >= 12 and count <= 1024 and byte_size(password) <= 4096
  end

  def valid?(_password), do: false

  @spec hash(String.t()) :: String.t()
  def hash(password) when is_binary(password) do
    salt = :crypto.strong_rand_bytes(@salt_bytes)
    digest = digest(password, salt, @iterations)
    "pbkdf2-sha256$#{@iterations}$#{Base.encode64(salt)}$#{Base.encode64(digest)}"
  end

  @spec verify(term(), term()) :: boolean()
  def verify(password, verifier) when is_binary(password) and is_binary(verifier) do
    case String.split(verifier, "$", parts: 4) do
      ["pbkdf2-sha256", iterations, salt, expected] ->
        with {count, ""} <- Integer.parse(iterations),
             true <- count > 0,
             {:ok, salt} <- Base.decode64(salt),
             {:ok, expected} <- Base.decode64(expected),
             true <- byte_size(expected) > 0 do
          Plug.Crypto.secure_compare(digest(password, salt, count), expected)
        else
          _invalid -> false
        end

      _other ->
        false
    end
  end

  def verify(_password, _verifier), do: false

  defp digest(password, salt, iterations) do
    :crypto.pbkdf2_hmac(:sha256, password, salt, iterations, @hash_bytes)
  end
end
