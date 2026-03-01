import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ChannelType } from "@/lib/api"

interface ConfigFieldsProps {
  type: ChannelType
  config: Record<string, string>
  onChange: (config: Record<string, string>) => void
}

function set(
  config: Record<string, string>,
  key: string,
  value: string,
  onChange: (c: Record<string, string>) => void,
) {
  onChange({ ...config, [key]: value })
}

export const EMPTY_CONFIG: Record<ChannelType, Record<string, string>> = {
  telegram: { bot_token: "", chat_id: "" },
  slack: { webhook_url: "" },
  slack_app: { bot_token: "", signing_secret: "", slack_channel: "" },
  webhook: { url: "", secret: "" },
  email: {
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    from_address: "",
    to_addresses: "",
  },
}

export function ConfigFields({ type, config, onChange }: ConfigFieldsProps) {
  const f = (key: string, value: string) => set(config, key, value, onChange)

  if (type === "telegram")
    return (
      <>
        <Field id="cfg-bot-token" label="Bot Token" type="password" value={config.bot_token} onChange={(v) => f("bot_token", v)} />
        <Field id="cfg-chat-id" label="Chat ID" value={config.chat_id} onChange={(v) => f("chat_id", v)} />
      </>
    )

  if (type === "slack")
    return (
      <Field id="cfg-webhook-url" label="Webhook URL" value={config.webhook_url} onChange={(v) => f("webhook_url", v)} placeholder="https://hooks.slack.com/..." />
    )

  if (type === "slack_app")
    return (
      <>
        <Field id="cfg-bot-token" label="Bot Token" type="password" value={config.bot_token} onChange={(v) => f("bot_token", v)} placeholder="xoxb-..." />
        <Field id="cfg-signing-secret" label="Signing Secret" type="password" value={config.signing_secret} onChange={(v) => f("signing_secret", v)} hint="Found in Slack App settings → Basic Information → App Credentials." />
        <Field id="cfg-slack-channel" label="Slack Channel" value={config.slack_channel} onChange={(v) => f("slack_channel", v)} placeholder="#ops-alerts or C01234ABCDE" hint="Channel name or ID to post approval messages into." />
      </>
    )

  if (type === "webhook")
    return (
      <>
        <Field id="cfg-url" label="URL" value={config.url} onChange={(v) => f("url", v)} placeholder="https://example.com/webhook" />
        <Field id="cfg-secret" label="Secret (optional)" type="password" value={config.secret} onChange={(v) => f("secret", v)} hint="HMAC-SHA256 signature sent in X-Signature header." />
      </>
    )

  // email
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="cfg-smtp-host" label="SMTP Host" value={config.smtp_host} onChange={(v) => f("smtp_host", v)} placeholder="smtp.example.com" />
        <Field id="cfg-smtp-port" label="SMTP Port" value={config.smtp_port} onChange={(v) => f("smtp_port", v)} placeholder="587" />
      </div>
      <Field id="cfg-smtp-user" label="SMTP User" value={config.smtp_user} onChange={(v) => f("smtp_user", v)} />
      <Field id="cfg-smtp-password" label="SMTP Password" type="password" value={config.smtp_password} onChange={(v) => f("smtp_password", v)} />
      <Field id="cfg-from-address" label="From Address" value={config.from_address} onChange={(v) => f("from_address", v)} placeholder="alerts@example.com" />
      <Field id="cfg-to-addresses" label="To Addresses" value={config.to_addresses} onChange={(v) => f("to_addresses", v)} placeholder="ops@example.com, team@example.com" hint="Comma-separated email addresses." />
    </>
  )
}

function Field({
  id, label, value, onChange, type, placeholder, hint,
}: {
  id: string
  label: string
  value: string | undefined
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
