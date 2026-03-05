# Database

Edictum Console uses PostgreSQL for persistent storage with SQLAlchemy 2.0 async ORM and Alembic for schema migrations.

## When to use this

Read this page when you need to understand the data model, debug a query, write a migration, or plan a backup strategy. Every table, its purpose, and key columns are documented here.

---

## Tables

### Core

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Customer organizations. Single tenant is the default UX, but the data model supports multiple. | `id`, `name`, `external_auth_id`, `created_at` |
| `users` | Local user accounts. Email/bcrypt password. | `id`, `tenant_id`, `email`, `password_hash`, `is_admin` |
| `api_keys` | bcrypt-hashed API keys with environment scope. Full key shown only at creation. | `id`, `tenant_id`, `key_prefix`, `key_hash`, `env`, `label`, `revoked_at` |
| `signing_keys` | Ed25519 keypairs. Private key encrypted at rest with NaCl SecretBox. One active key per tenant. | `id`, `tenant_id`, `public_key` (bytes), `private_key_encrypted` (bytes), `active` |

### Contracts and Bundles

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `contracts` | Versioned individual contracts in the library. Each update creates a new version row. | `id`, `tenant_id`, `contract_id` (stable ID), `version`, `type`, `name`, `definition` (JSON), `tags` (JSON), `is_latest`, `created_by` |
| `bundle_compositions` | Composition recipes — ordered lists of contracts with mode overrides. | `id`, `tenant_id`, `name` (unique per tenant), `description`, `defaults_mode`, `update_strategy`, `tools_config` (JSON), `observability` (JSON) |
| `bundle_composition_items` | Contract membership within a composition. Position determines order. | `id`, `tenant_id`, `composition_id`, `contract_id`, `position`, `mode_override`, `enabled` |
| `bundles` | Versioned contract bundles (compiled YAML + Ed25519 signature). | `id`, `tenant_id`, `name`, `version`, `revision_hash`, `yaml_bytes`, `signature` (bytes), `composition_id`, `composition_snapshot` (JSON), `uploaded_by` |
| `deployments` | Bundle deployment records — which version is active for each environment. | `id`, `tenant_id`, `env`, `bundle_name`, `bundle_version`, `deployed_by`, `created_at` |

**Unique constraints:**

- `bundles`: `(tenant_id, name, version)`
- `contracts`: `(tenant_id, contract_id, version)`
- `bundle_compositions`: `(tenant_id, name)`
- `bundle_composition_items`: `(composition_id, contract_id)`

### Events and Approvals

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `events` | Audit events from agent tool calls. Partitioned by month. | `id`, `tenant_id`, `call_id`, `agent_id`, `tool_name`, `verdict`, `mode`, `env`, `timestamp`, `payload` (JSON) |
| `approvals` | HITL approval requests with state machine (pending → approved/denied/timeout). | `id`, `tenant_id`, `agent_id`, `tool_name`, `tool_args` (JSON), `message`, `status`, `env`, `timeout_seconds`, `timeout_effect`, `decision_source`, `contract_name`, `decided_by`, `decided_at`, `decision_reason`, `decided_via` |

**Events deduplication:** unique constraint on `(tenant_id, call_id, created_at)`. Duplicate `call_id` values within the same tenant are silently ignored on ingest.

### Notifications

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_channels` | Channel configurations with encrypted secrets. | `id`, `tenant_id`, `name`, `channel_type`, `config_encrypted` (bytes), `enabled`, `filters` (JSON), `last_test_at`, `last_test_ok` |

Channel types: `telegram`, `slack`, `slack_app`, `discord`, `webhook`, `email`.

### Agents and Assignment

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agent_registrations` | Persistent agent identities. Auto-created on first SSE connection. | `id`, `tenant_id`, `agent_id` (unique per tenant), `display_name`, `tags` (JSON), `bundle_name`, `last_seen_at` |
| `assignment_rules` | Pattern-based bundle assignment rules, priority-ordered. | `id`, `tenant_id`, `priority` (unique per tenant), `pattern`, `tag_match` (JSON), `bundle_name`, `env` |

### AI

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenant_ai_configs` | Per-tenant AI provider configuration (Anthropic, OpenAI, OpenRouter, Ollama). | `id`, `tenant_id`, `provider`, `api_key_encrypted` (bytes), `model`, `base_url` |
| `ai_usage_logs` | Token usage and cost tracking per AI request. | `id`, `tenant_id`, `provider`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `duration_ms`, `estimated_cost_usd`, `request_type` |

---

## Events Partitioning

The `events` table is PostgreSQL range-partitioned by `created_at` (monthly partitions).

```
events (parent table)
├── events_2026_01
├── events_2026_02
├── events_2026_03
├── ...
```

**Partition management:** A background worker runs every 24 hours and ensures partitions exist for the next 3 months. Partitions are created with:

```sql
CREATE TABLE events_YYYY_MM PARTITION OF events
  FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
```

**Purging:** The settings danger zone allows purging events older than 30, 60, or 90 days. This drops entire monthly partitions for efficiency rather than row-by-row deletion.

---

## Migrations

Alembic manages schema changes. Migrations run automatically on server startup.

| Revision | Description |
|----------|-------------|
| `001` | Initial schema: tenants, users, api_keys, signing_keys, bundles, deployments, events, approvals, notification_channels |
| `002` | Add `env` column to events, add timestamp index |
| `003` | Add composable contracts: contracts, bundle_compositions, bundle_composition_items tables |
| `004` | Add agent management: agent_registrations, assignment_rules tables |
| `005` | Add AI assistant: tenant_ai_configs, ai_usage_logs tables |
| `006` | Encrypt notification channel config: add `config_encrypted` column |

### Running Migrations Manually

Migrations run on startup, but you can also run them manually:

```bash
# Inside the container
alembic upgrade head

# Check current revision
alembic current
```

---

## Tenant Isolation

Every table with user data has a `tenant_id` column. Every database query filters by `tenant_id` from the authenticated context. There are no admin-sees-all queries. This is enforced at the service layer — routes extract `tenant_id` from the auth context and pass it to every service call.

The `tenant_id` is resolved from:

- **API key auth:** `tenant_id` stored on the API key row
- **Dashboard auth:** `tenant_id` stored in the Redis session

---

## Backup Recommendations

1. **PostgreSQL:** Use `pg_dump` or continuous archiving (WAL). The events table is the largest — consider backing up partitions individually.
2. **Redis:** Sessions are ephemeral (TTL-based). Loss of Redis data means users must re-login. No critical data is Redis-only.
3. **Encryption keys:** Back up `EDICTUM_SIGNING_KEY_SECRET`. Without it, encrypted private keys and notification secrets cannot be decrypted.
