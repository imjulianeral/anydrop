defmodule Phemera.Release do
  @moduledoc false

  @app :phemera

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

      bin/phemera eval 'Phemera.Release.import_hashes("/tmp/list.txt", "md5", "csam", "ncmec")'
  """
  @spec import_hashes(Path.t(), String.t(), String.t(), String.t()) ::
          {:ok, non_neg_integer()} | {:error, term()}
  def import_hashes(path, type, category, source) do
    load_app()

    {:ok, result, _apps} =
      Ecto.Migrator.with_repo(Phemera.Repo, fn _repo ->
        Phemera.Moderation.HashList.import_file(path, type, category, source)
      end)

    result
  end

  @doc """
  Moves an account to a plan, for example:

      bin/phemera eval 'Phemera.Release.set_plan("person@example.com", "enterprise")'
  """
  @spec set_plan(String.t(), String.t()) :: {:ok, term()} | {:error, term()}
  def set_plan(email_or_id, plan) do
    load_app()

    {:ok, result, _apps} =
      Ecto.Migrator.with_repo(Phemera.Repo, fn repo ->
        user =
          case Ecto.UUID.cast(email_or_id) do
            {:ok, id} ->
              repo.get(Phemera.Auth.User, id)

            :error ->
              import Ecto.Query

              repo.one(
                from u in Phemera.Auth.User,
                  where: fragment("lower(?)", u.email) == ^String.downcase(email_or_id)
              )
          end

        if user, do: Phemera.Teams.set_plan(user, plan), else: {:error, :user_not_found}
      end)

    result
  end

  @doc """
  Sends a test message with the configured mailer and waits for the result:

      bin/phemera eval 'Phemera.Release.send_test_email("me@example.com")'
  """
  @spec send_test_email(String.t()) :: {:ok, term()} | {:error, term()}
  def send_test_email(address) do
    {:ok, _apps} = Application.ensure_all_started(:swoosh)
    load_app()
    address |> Phemera.Mailer.Emails.test_message() |> Phemera.Mailer.deliver()
  end

  defp load_app do
    Application.load(@app)
  end
end
