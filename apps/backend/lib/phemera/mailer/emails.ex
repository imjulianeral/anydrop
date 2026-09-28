defmodule Phemera.Mailer.Emails do
  @moduledoc false
  import Swoosh.Email

  alias Phemera.Mailer

  def team_invitation(invitation, team, inviter, url) do
    inviter_name = inviter.name || "Someone"

    new()
    |> to(invitation.email)
    |> from(Mailer.from())
    |> subject("#{inviter_name} invited you to #{team.name} on Phemera")
    |> text_body("""
    #{inviter_name} invited you to join #{team.name} on Phemera.

    Members of a team can send files to each other's saved devices from anywhere.

    Accept the invitation and create your account:
    #{url}

    This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.
    """)
    |> html_body("""
    <!doctype html>
    <html>
      <body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr><td align="center">
            <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px" cellspacing="0" cellpadding="0">
              <tr><td>
                <p style="margin:0 0 8px;font-size:14px;color:#78716c">Phemera</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">#{escape(inviter_name)} invited you to #{escape(team.name)}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5">Members of a team can send files to each other's saved devices from anywhere.</p>
                <a href="#{escape(url)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px;font-weight:600">Accept invitation</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#78716c">This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
    """)
  end

  def test_message(address) do
    new()
    |> to(address)
    |> from(Mailer.from())
    |> subject("Phemera mail check")
    |> text_body("If you can read this, Phemera can deliver email to #{address}.")
  end

  defp escape(value), do: value |> Plug.HTML.html_escape() |> IO.iodata_to_binary()
end
