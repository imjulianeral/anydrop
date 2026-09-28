defmodule Phemera.Mailer do
  @moduledoc """
  Outgoing email. Production delivers straight to each recipient's mail server
  (see `Phemera.Mailer.DirectAdapter`); development keeps messages in memory
  for the `/dev/mailbox` preview, and tests use `Swoosh.Adapters.Test`.
  """
  use Swoosh.Mailer, otp_app: :phemera

  require Logger

  @doc """
  Sends without blocking the request. Direct delivery can take several seconds
  while the recipient's server is looked up and contacted, so callers always
  get a link they can share by hand as well.
  """
  @spec deliver_later(Swoosh.Email.t()) :: :ok
  def deliver_later(email) do
    if Application.get_env(:phemera, :mailer_async, true) do
      {:ok, _pid} =
        Task.Supervisor.start_child(Phemera.TaskSupervisor, fn -> deliver_logged(email) end)
    else
      deliver_logged(email)
    end

    :ok
  end

  @spec from() :: {String.t(), String.t()}
  def from, do: Application.get_env(:phemera, :mail_from, {"Phemera", "no-reply@localhost"})

  defp deliver_logged(email) do
    case deliver(email) do
      {:ok, _receipt} ->
        :ok

      {:error, reason} ->
        Logger.warning("Email #{inspect(email.subject)} was not delivered: #{inspect(reason)}")
        :error
    end
  end
end
