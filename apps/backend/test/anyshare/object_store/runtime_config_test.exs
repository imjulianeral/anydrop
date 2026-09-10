defmodule Anyshare.ObjectStore.RuntimeConfigTest do
  use ExUnit.Case, async: false

  @runtime_config Path.expand("../../../config/runtime.exs", __DIR__)
  @r2_env %{
    "R2_ACCESS_KEY_ID" => "test-access",
    "R2_SECRET_ACCESS_KEY" => "test-secret",
    "R2_BUCKET" => "test-files",
    "R2_ENDPOINT" => "https://example.r2.cloudflarestorage.com",
    "R2_REGION" => "auto"
  }

  setup do
    env =
      Map.merge(@r2_env, %{
        "DATABASE_URL" => "postgresql://postgres:postgres@localhost/anyshare_test",
        "SECRET_KEY_BASE" => String.duplicate("a", 64)
      })

    original =
      Map.new(["ALCHEMY_DEV" | Map.keys(env)], fn key -> {key, System.get_env(key)} end)

    System.put_env(env)
    System.delete_env("ALCHEMY_DEV")

    on_exit(fn ->
      Enum.each(original, fn
        {key, nil} -> System.delete_env(key)
        {key, value} -> System.put_env(key, value)
      end)
    end)

    :ok
  end

  test "production receives the bucket credentials" do
    config = read_config(:prod)

    assert config.bucket == "test-files"
    assert config.access_key_id == "test-access"
    assert config.secret_access_key == "test-secret"
    assert config.endpoint == "https://example.r2.cloudflarestorage.com"
    assert config.region == "auto"
  end

  test "production rejects each missing or empty R2 setting" do
    for key <- ~w(R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT),
        value <- [nil, ""] do
      System.put_env(%{key => value})

      assert_raise RuntimeError, "#{key} is required in production", fn ->
        read_config(:prod)
      end

      System.put_env(key, Map.fetch!(@r2_env, key))
    end
  end

  test "production unwraps Alchemy redacted credentials" do
    System.put_env(
      "R2_SECRET_ACCESS_KEY",
      Jason.encode!(%{_tag: "Redacted", value: "derived-secret"})
    )

    assert read_config(:prod).secret_access_key == "derived-secret"
  end

  test "standalone development permits local storage without R2 credentials" do
    for {key, _value} <- @r2_env, do: System.delete_env(key)

    config = read_config(:dev)

    assert is_nil(config.access_key_id)
    assert is_nil(config.secret_access_key)
    assert is_nil(config.bucket)
    assert is_nil(config.endpoint)
  end

  test "alchemy dev production permits local storage without R2 credentials" do
    for {key, _value} <- @r2_env, do: System.delete_env(key)
    System.put_env("ALCHEMY_DEV", "true")

    config = read_config(:prod)

    assert is_nil(config.access_key_id)
    assert is_nil(config.secret_access_key)
    assert is_nil(config.bucket)
    assert is_nil(config.endpoint)
  end

  defp read_config(env) do
    @runtime_config
    |> Config.Reader.read!(env: env, target: :host)
    |> Keyword.fetch!(:anyshare)
    |> Keyword.fetch!(:r2)
  end
end
