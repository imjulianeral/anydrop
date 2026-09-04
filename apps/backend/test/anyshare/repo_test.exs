defmodule Anyshare.RepoTest do
  use ExUnit.Case, async: true

  alias Anyshare.Repo

  test "disables SSL for local sslmode=disable URLs" do
    config =
      Repo.configure(
        url: "postgresql://postgres:postgres@host.docker.internal:51214/postgres?sslmode=disable"
      )

    assert config[:ssl] == false
    refute Keyword.has_key?(config, :sslmode)
  end

  test "enables verified SSL for PlanetScale sslmode=verify-full URLs" do
    config =
      Repo.configure(
        url:
          "postgresql://user:pass@aws-us-east-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full"
      )

    assert config[:ssl] == true
  end

  test "unwraps redacted DATABASE_URL payloads" do
    encoded =
      ~s({"_tag":"Redacted","value":"postgresql://postgres:postgres@db:5432/postgres?sslmode=require"})

    config = Repo.configure(url: encoded)

    assert config[:url] == "postgresql://postgres:postgres@db:5432/postgres?sslmode=require"
    assert config[:ssl] == [verify: :verify_none]
  end
end
