# Edictum Console

**Self-hostable agent operations console — runtime governance for AI agents.**

Edictum Console is the dashboard and backend for managing AI agents at runtime. It provides:

- **Real-time visibility** into what your agents are doing
- **Approval workflows** for human-in-the-loop oversight
- **Contract management** for runtime governance
- **Multi-tenant** isolation for team environments
- **Audit trails** for compliance and debugging

## The One-Liner

Edictum Console is a web dashboard where you manage API keys, deploy contracts, approve or deny agent actions, and view audit logs — all backed by a FastAPI server that agents connect to via the `edictum` Python library.

## How It Fits

```
┌─────────────────────────────────────────────────────────────┐
│                    Edictum Console                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Dashboard  │  │    API       │  │  PostgreSQL  │      │
│  │   (React)    │  │  (FastAPI)   │  │  + Redis     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
         ▲                   ▲                   ▲
         │                   │                   │
    Human users          API keys            Webhooks
    (browser)         (edk_xxx...)        (Telegram, Slack)
                              │
                              ▼
         ┌────────────────────────────────────┐
         │        AI Agent (Python)           │
         │                                    │
         │  import edictum                    │
         │  guard = edictum.Edictum.from_yaml │
         │    ("contracts.yaml",              │
         │     backend=ServerBackend(client)) │
         └────────────────────────────────────┘
```

## Quick Links

| I want to... | Go to |
|--------------|-------|
| Run it locally | [Quickstart](quickstart.md) |
| Deploy to production | [Docker Guide](guides/docker.md) |
| Connect my agent | [Connect an Agent](guides/connect-agent.md) |
| Set up Slack/Telegram | [Notifications](guides/notifications.md) |
| See all config options | [Configuration](reference/configuration.md) |

## What Edictum Console Is NOT

- **Not a replacement for edictum core.** The `edictum` Python library works standalone. Console adds multi-agent visibility, persistence, and team features.
- **Not a model provider.** Console governs tool calls, not LLM inference.
- **Not a chat interface.** Use it to manage agents, not to chat with them.

## License

Apache License 2.0. Self-host freely.
