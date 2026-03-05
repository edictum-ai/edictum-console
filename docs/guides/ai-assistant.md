# AI Contract Assistant

A streaming chat assistant that helps you write edictum contracts. Knows the full contract schema and answers questions about selectors, operators, and effects.

## Supported Providers

| Provider | Default Model | Notes |
|----------|--------------|-------|
| **Anthropic** | `claude-haiku-4-5-20251001` | Claude API key required |
| **OpenAI** | `gpt-5-mini` | OpenAI API key required |
| **OpenRouter** | `qwen/qwen3-4b:free` | OpenRouter API key; access to 100+ models |
| **Ollama** | `llama3` | Local models, no API key needed |

## Setup

Dashboard > **Settings** > **AI**.

1. Select a **provider** from the dropdown
2. Enter your **API key** (not needed for Ollama)
3. Optionally override the **model name**
4. Optionally set a **base URL** (required for OpenRouter and Ollama)
5. Click **Test Connection**

### Test Connection

The test sends a probe request to the provider and returns:

- Model name confirmed
- Response latency (ms)
- Success/failure status

```
POST /api/v1/settings/ai/test
```

### Provider-Specific Configuration

**Anthropic:**
```
API Key: sk-ant-api03-...
Model: claude-haiku-4-5-20251001 (default)
```

**OpenAI:**
```
API Key: sk-...
Model: gpt-5-mini (default)
```

**OpenRouter:**
```
API Key: sk-or-v1-...
Base URL: https://openrouter.ai/api/v1
Model: qwen/qwen3-4b:free (default)
```

**Ollama:**
```
Base URL: http://localhost:11434
Model: llama3 (default)
No API key needed
```

## Security

### API Key Encryption

API keys are encrypted at rest using NaCl SecretBox. They are never stored in plaintext. In API responses, keys are masked (e.g. `sk-ant-••••xyz`).

### Prompt Injection Prevention

User-provided YAML is injected as a user-context message, not appended to the system prompt. This prevents the assistant from treating user content as instructions.

## Using the Assistant

Dashboard > **Contracts** > **Library** tab > AI chat panel (right side).

### What You Can Ask

- "Write a contract that blocks rm -rf commands"
- "What selectors can I use for post contracts?"
- "Why isn't my contract matching calls to read_file?"
- "Add a session limit of 100 tool calls"
- "Convert this contract to observe mode"

### How It Works

The system prompt embeds the full edictum contract schema:
- 4 contract types (pre, post, session, sandbox)
- 13 selectors (args.*, result.*, etc.)
- 15 operators (equals, contains, starts_with, regex, etc.)
- 5 effects (allow, deny, approval_required, redact, log)

The assistant uses this knowledge to write correct YAML and explain contract behavior.

### Multi-Turn Conversations

The chat supports multi-turn conversations with streaming responses. Context is preserved within the session -- you can iterate on a contract across multiple messages.

## Usage Tracking

Dashboard > **Settings** > **AI** > **Usage** section.

Track AI usage per tenant:

| Metric | Description |
|--------|-------------|
| Total tokens | Input + output tokens consumed |
| Estimated cost | Based on provider pricing |
| Query count | Number of assistant interactions |
| Avg tokens/sec | Streaming throughput |
| Daily chart | Usage breakdown by day |

Usage data is retained for 90 days. Older records are automatically purged on startup.

### Cost Estimation

For OpenRouter models, pricing is fetched dynamically from the OpenRouter API (cached for 1 hour). For Anthropic and OpenAI, standard pricing tables are used.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/settings/ai` | GET | Get current AI config (key masked) |
| `/api/v1/settings/ai` | PUT | Update AI config |
| `/api/v1/settings/ai/test` | POST | Test connection to provider |
| `/api/v1/settings/ai/usage` | GET | Usage stats and daily breakdown |
| `/api/v1/contracts/assist` | POST | Streaming chat endpoint |

## Next Steps

- [Managing Contracts](managing-contracts.md) -- create contracts the assistant helps you write
- [Dashboard Overview](dashboard-overview.md) -- navigate the full dashboard
