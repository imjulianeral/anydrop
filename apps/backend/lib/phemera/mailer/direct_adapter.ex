defmodule Phemera.Mailer.DirectAdapter do
  @moduledoc """
  Delivers mail without a relay or email provider. For each recipient domain it
  looks up the domain's MX records and hands the message to that server over
  SMTP on port 25, upgrading to TLS when the server offers it. Messages are
  DKIM-signed when `:dkim` is configured so receivers can verify the sender.

  gen_smtp treats `:relay` as a domain whose MX records it resolves, so the
  recipient's domain is passed as the relay.
  """
  use Swoosh.Adapter, required_deps: [gen_smtp: :gen_smtp_client]

  alias Swoosh.Adapters.SMTP
  alias Swoosh.Adapters.SMTP.Helpers
  alias Swoosh.Email

  @impl true
  def deliver(%Email{} = email, config) do
    sender = Helpers.sender(email)
    body = Helpers.body(email, config)
    options = config |> Keyword.drop([:adapter, :dkim]) |> SMTP.gen_smtp_config()

    email
    |> recipients_by_domain()
    |> Enum.reduce_while({:ok, []}, fn {domain, recipients}, {:ok, receipts} ->
      case send(sender, recipients, body, Keyword.put(options, :relay, domain)) do
        {:ok, receipt} -> {:cont, {:ok, [receipt | receipts]}}
        error -> {:halt, error}
      end
    end)
    |> case do
      {:ok, receipts} -> {:ok, %{receipts: Enum.reverse(receipts)}}
      error -> error
    end
  end

  defp send(sender, recipients, body, options) do
    case :gen_smtp_client.send_blocking({sender, recipients, body}, options) do
      receipt when is_binary(receipt) -> {:ok, receipt}
      {:error, type, message} -> {:error, {type, message}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp recipients_by_domain(email) do
    [email.to, email.cc, email.bcc]
    |> Enum.concat()
    |> Enum.map(fn {_name, address} -> address end)
    |> Enum.uniq()
    |> Enum.group_by(fn address ->
      address |> String.split("@") |> List.last() |> String.downcase()
    end)
  end
end
