# Quickstart

In seven steps you will deploy Edictum Console, connect an agent, and deploy a contract that the agent picks up live — no restart, no redeployment. The whole flow takes about five minutes.

## 1. Prerequisites

You need:

- **Docker** and **Docker Compose** (v2)
- **Python 3.12+** (for the agent side)
- **Git**

## 2. Clone and Configure

```bash
$ git clone https://github.com/edictum-ai/edictum-console.git
$ cd edictum-console
$ cp .env.example .env
```

Generate the required secrets and append them to `.env`:

```bash
$ python -c "import secrets; print(f'EDICTUM_SECRET_KEY={secrets.token_hex(32)}')" >> .env
$ python -c "import secrets; print(f'EDICTUM_SIGNING_KEY_SECRET={secrets.token_hex(32)}')" >> .env
$ python -c "import secrets; print(f'POSTGRES_PASSWORD={secrets.token_hex(16)}')" >> .env
```

!!! warning "Keep your secrets safe"
    `EDICTUM_SECRET_KEY` signs session tokens. `EDICTUM_SIGNING_KEY_SECRET` encrypts Ed25519 bundle-signing keys. If either leaks, rotate immediately. Never commit `.env` to version control.

## 3. Start the Console

```bash
$ docker compose up -d
```

Three services start: Postgres 16, Redis 7, and the Edictum Console server. Wait for all health checks to pass:

```bash
$ docker compose ps
```

The console is now running at `http://localhost:8000`.

## 4. Bootstrap Your Admin Account

You have two options:

=== "Setup Wizard (recommended)"

    Open [http://localhost:8000/dashboard/setup](http://localhost:8000/dashboard/setup) in your browser.

    Fill in your email and a password (minimum 12 characters). Click **Create Account**. You're redirected to the dashboard.

=== "Environment Variables"

    Set these in `.env` before starting:

    ```bash
    EDICTUM_ADMIN_EMAIL=admin@example.com
    EDICTUM_ADMIN_PASSWORD=your-secure-password-here
    ```

    Then restart the server:

    ```bash
    $ docker compose restart server
    ```

    The admin account is created automatically on startup. Log in at [http://localhost:8000/dashboard](http://localhost:8000/dashboard).

!!! note "Bootstrap lock"
    Admin creation only works when zero users exist. After the first admin is created, both paths return 409. This prevents privilege escalation.

## 5. Create an API Key

1. Log in to the dashboard
2. Navigate to **API Keys** in the sidebar
3. Click **Create Key**
4. Choose an environment (e.g., `production`)
5. Copy the full key — it's shown only once

The key looks like `edk_production_CZxKQvN3mHz...`. You'll use it in the next step.

## 6. Connect Your Agent

Install the server SDK:

```bash
$ pip install edictum[server]
```

Connect your agent to the console:

```python
from edictum import Edictum

guard = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_CZxKQvN3mHz...",
    agent_id="my-agent",
    env="production",
    bundle_name="my-contracts",
)
```

The agent is now:

- **Connected** via SSE for live contract updates
- **Sending** audit events in batches (50 events or 5 seconds)
- **Routing** approval requests through the console
- **Visible** in the dashboard Agents page

Use `guard.run()` exactly like local edictum:

```python
from edictum import EdictumDenied

try:
    result = await guard.run("read_file", {"path": "data.csv"}, read_file)
except EdictumDenied as e:
    print(f"Denied: {e.reason}")
```

!!! tip "No contracts deployed yet?"
    If no bundle is deployed for the agent's environment, `from_server()` still connects successfully. The agent runs without contracts until you deploy one. Events are still recorded.

## 7. Deploy a Contract

1. In the dashboard, navigate to **Contracts** → **Library**
2. Click **New Contract** — a dialog opens with metadata fields and a YAML editor
3. Fill in the fields:
   - **Contract ID:** `block-dotenv`
   - **Type:** `pre`
   - **Name:** `Block .env reads`
4. In the **Definition (YAML)** editor, paste:

```yaml
tool: read_file
when:
  args.path: { contains: ".env" }
then:
  effect: deny
  message: "Read of sensitive file denied: {args.path}"
```

5. Click **Create**
6. Go to **Contracts** → **Bundles**
7. Click **New Bundle**, name it `my-contracts`, then click **Create**
8. In the bundle editor, click **Add Contracts**, find `block-dotenv` in the picker and click **+** to add it, then click **Done**
9. Click **Save** to save the bundle composition
10. Click **Deploy**, select `production` as the target environment, and click **Deploy** to confirm

The agent picks up the new contract instantly via SSE — no restart needed. Try it:

```python
# This will now be denied by the contract you just deployed
try:
    await guard.run("read_file", {"path": ".env"}, read_file)
except EdictumDenied as e:
    print(f"Denied: {e.reason}")
    # "Read of sensitive file denied: .env"
```

Check the **Events** page in the dashboard — you'll see the denial event with full context: which contract denied it, the tool arguments, and the agent that triggered it.

Change the contract in the dashboard, deploy again, and the agent picks it up live. That's the loop:

```
Edit contract → Deploy → Agent picks it up → No restart
```

## Next Steps

- [How it works](concepts/how-it-works.md) — understand the architecture and evaluation pipeline
- [Contract model](concepts/contracts.md) — the three-level composable contract model
- [Live hot-reload](concepts/hot-reload.md) — how SSE push and bundle signing work
- [Approvals](concepts/approvals.md) — human-in-the-loop approval workflows
- [Notifications](guides/notifications/overview.md) — set up Telegram, Slack, Discord, or webhook notifications
- [Self-hosting](guides/self-hosting.md) — production deployment with HTTPS, backups, and monitoring
- [Environment variables](reference/environment-variables.md) — all configuration options
- [Edictum core docs](https://docs.edictum.dev/) — contract YAML reference, framework adapters, observe mode
