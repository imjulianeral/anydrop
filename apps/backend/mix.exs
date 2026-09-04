defmodule Anyshare.MixProject do
  use Mix.Project

  def project do
    [
      app: :anyshare,
      version: "0.1.0",
      elixir: "~> 1.18",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases()
    ]
  end

  def application do
    [
      mod: {Anyshare.Application, []},
      extra_applications: [:crypto, :inets, :logger, :public_key, :runtime_tools, :ssl]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_env), do: ["lib"]

  defp deps do
    [
      {:bandit, "~> 1.8"},
      {:ecto_sql, "~> 3.13"},
      {:jason, "~> 1.4"},
      {:phoenix, "~> 1.8.1"},
      {:phoenix_ecto, "~> 4.7"},
      {:postgrex, ">= 0.0.0"},
      {:websock_adapter, "~> 0.6"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      "ecto.setup": ["ecto.create", "ecto.migrate"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"]
    ]
  end
end
