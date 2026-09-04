defmodule Anyshare.Release do
  @moduledoc false

  @app :anyshare

  @spec migrate() :: :ok
  def migrate do
    load_app()

    for repo <- Application.fetch_env!(@app, :ecto_repos) do
      {:ok, _result, _apps} =
        Ecto.Migrator.with_repo(repo, fn repository ->
          Ecto.Migrator.run(repository, :up, all: true)
        end)
    end

    :ok
  end

  defp load_app do
    Application.load(@app)
  end
end
