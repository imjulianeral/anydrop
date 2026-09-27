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

  @doc """
  Imports a hash list file in production, for example:

      bin/anyshare eval 'Anyshare.Release.import_hashes("/tmp/list.txt", "md5", "csam", "ncmec")'
  """
  @spec import_hashes(Path.t(), String.t(), String.t(), String.t()) ::
          {:ok, non_neg_integer()} | {:error, term()}
  def import_hashes(path, type, category, source) do
    load_app()

    {:ok, result, _apps} =
      Ecto.Migrator.with_repo(Anyshare.Repo, fn _repo ->
        Anyshare.Moderation.HashList.import_file(path, type, category, source)
      end)

    result
  end

  defp load_app do
    Application.load(@app)
  end
end
