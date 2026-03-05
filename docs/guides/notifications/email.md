# Email (SMTP) Setup

Send approval notifications via email. Includes a deep link button to the dashboard for approve/deny.

## Add the Channel

Dashboard > **Settings** > **Notifications** > **Add Channel** > **Email**.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| SMTP Host | Yes | -- | Mail server hostname (e.g. `smtp.gmail.com`) |
| SMTP Port | No | `587` | Mail server port |
| SMTP User | Yes | -- | Login username (usually your email address) |
| SMTP Password | Yes | -- | Login password or app-specific password |
| From Address | Yes | -- | Sender email (e.g. `edictum@example.com`) |
| To Addresses | Yes | -- | Comma-separated recipient emails |

## TLS

The console uses STARTTLS by default (standard for port 587). This upgrades the connection to TLS after the initial handshake.

Common SMTP configurations:

| Provider | Host | Port |
|----------|------|------|
| Gmail | `smtp.gmail.com` | 587 |
| Outlook/Office 365 | `smtp.office365.com` | 587 |
| Amazon SES | `email-smtp.{region}.amazonaws.com` | 587 |
| SendGrid | `smtp.sendgrid.net` | 587 |
| Mailgun | `smtp.mailgun.org` | 587 |

**Gmail note:** Use an [App Password](https://myaccount.google.com/apppasswords), not your regular password. Requires 2FA to be enabled.

## Test

After saving, click **Test** to send a test email. Verify it arrives in the inbox (check spam/junk folders).

## Email Format

Approval notification emails include:

- **Subject**: `[Edictum] Approval Required: {tool_name}`
- **Body**: HTML email with:
  - Agent ID and environment
  - Tool name and arguments
  - Contract that triggered the approval
  - Timeout countdown
  - **"Review in Dashboard"** button -- deep link to the approval in the console

## Limitations

Email is **not interactive** -- there are no approve/deny buttons in the email itself. The email contains a link to the dashboard where you can approve or deny the request.

For interactive approve/deny directly in notifications, use [Telegram](telegram.md), [Slack](slack.md), or [Discord](discord.md).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test email not received | Check spam/junk folder. Verify SMTP credentials. |
| `Authentication failed` | Wrong credentials. For Gmail, use an App Password. |
| `Connection refused` | Wrong host or port. Check firewall rules. |
| `STARTTLS extension not supported` | Server may use implicit TLS on port 465 -- try port 587 instead. |
| Emails going to spam | Set up SPF/DKIM records for your sending domain. |

## Next Steps

- [Notification Overview](overview.md) -- routing filters and channel management
- [Telegram Setup](telegram.md) -- interactive approve/deny in Telegram
