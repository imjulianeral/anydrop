defmodule Phemera.MixProject do
  use Mix.Project

  def project do
    [
      app: :phemera,
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
      mod: {Phemera.Application, []},
      extra_applications: [:crypto, :inets, :logger, :public_key, :runtime_tools, :ssl, :xmerl]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_env), do: ["lib"]

  defp deps do
    [
      {:assent, "~> 0.3.1"},
      {:bandit, "~> 1.8"},
      {:certifi, "~> 2.15"},
      {:ecto_sql, "~> 3.13"},
      {:gen_smtp, "~> 1.2"},
      {:jason, "~> 1.4"},
      {:phoenix, "~> 1.8.1"},
      {:phoenix_ecto, "~> 4.7"},
      {:postgrex, ">= 0.0.0"},
      {:swoosh, "~> 1.17"},
      {:ssl_verify_fun, "~> 1.1"},
      {:websock_adapter, "~> 0.6"},
      {:wax_, "~> 0.7.0"}
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
