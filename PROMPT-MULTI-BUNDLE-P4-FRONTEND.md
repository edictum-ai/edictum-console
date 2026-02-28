# PROMPT-MULTI-BUNDLE-P4-FRONTEND — Frontend API Client + SDK_COMPAT

> **Scope:** Frontend TypeScript API types/functions, SDK_COMPAT.md updates. No UI components.
> **Depends on:** P2 (routes) + P3 (push/SSE) — all backend endpoints must exist.
> **Deliverable:** Frontend API client matches new backend, SDK_COMPAT reflects all changes.
> **Time budget:** ~20 min

---

## Required Reading

1. `Multi-BundleDataModel.md` §7 (Frontend API Client), §6g (Agent fleet frontend types)
2. `dashboard/src/lib/api/bundles.ts` — Current types + functions
3. `dashboard/src/lib/api/index.ts` — Current re-exports
4. `dashboard/src/lib/api/client.ts` — `request()` helper, `API_BASE`, `ApiError`
5. `SDK_COMPAT.md` — Current API contract (will be updated)

---

## Files to Modify

### 1. `dashboard/src/lib/api/bundles.ts`

**Rewrite types and functions to match new name-scoped routes.**

Types to update:
- `BundleResponse` — add `name: string`
- `BundleWithDeployments` — inherits updated `BundleResponse`
- `DeploymentResponse` — add `bundle_name: string`

Types to add:
- `BundleSummary` — `name`, `latest_version`, `version_count`, `last_updated`, `deployed_envs`

Functions to update:
- `listBundles()` → returns `BundleSummary[]` (was `BundleWithDeployments[]`)
- `deployBundle(name, version, env)` → now takes `name` as first param
- `getBundleYaml(name, version)` → takes `name`, returns `Promise<string>`
- `getCurrentBundle(name, env)` → takes `name` as first param
- `listDeployments(bundleName?, env?, limit?)` → add `bundleName` filter

Functions to add:
- `listBundleVersions(name)` → `GET /bundles/{name}`, returns `BundleWithDeployments[]`

Functions unchanged:
- `uploadBundle(yamlContent)` — POST path unchanged, name extracted server-side
- `evaluateBundle(body)` — takes raw YAML, unchanged

**Use `encodeURIComponent(name)` in all URL path segments** containing bundle name.

**Target:** ~110 lines (currently 105).

### 2. Create `dashboard/src/lib/api/agents.ts`

**New file:**

```typescript
import { request } from "./client"

export interface AgentStatusEntry {
  agent_id: string
  env: string
  bundle_name: string | null
  policy_version: string | null
  status: "current" | "drift" | "unknown"
  connected_at: string
}

export interface AgentFleetStatus {
  agents: AgentStatusEntry[]
}

export function getAgentStatus(bundleName?: string) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  return request<AgentFleetStatus>(`/agents/status?${params}`)
}
```

**Target:** ~20 lines.

### 3. `dashboard/src/lib/api/index.ts`

**Update re-exports:**
- Add `listBundleVersions` to function exports from `./bundles`
- Add `BundleSummary` to type exports from `./bundles`
- Add `getAgentStatus` from `./agents`
- Add `AgentStatusEntry`, `AgentFleetStatus` type exports from `./agents`

### 4. `SDK_COMPAT.md`

**Update to reflect all API changes:**

Bundle routes:
- Document new name-scoped route structure
- Remove old route documentation (`/bundles/{version}`, `/bundles/current`)

SSE:
- Document `bundle_name` + `policy_version` query params on `GET /api/v1/stream`
- Document `contract_update` payload with `bundle_name` and `public_key` fields
- Document `bundle_uploaded` event with `bundle_name`

Agent fleet:
- Document `GET /api/v1/agents/status` endpoint

Audit events:
- Document `bundle_name` field in event payload (optional, SDK v0.12+)

Deployments:
- Document `bundle_name` query filter on `GET /api/v1/deployments`

---

## Verification Checklist

- [ ] `pnpm tsc --noEmit` passes in `dashboard/` (TypeScript compiles)
- [ ] `listBundles()` return type is `BundleSummary[]`
- [ ] `listBundleVersions("devops-agent")` calls correct URL
- [ ] `deployBundle("devops-agent", 1, "production")` calls `/bundles/devops-agent/1/deploy`
- [ ] `getBundleYaml("devops-agent", 1)` calls `/bundles/devops-agent/1/yaml`
- [ ] `getCurrentBundle("devops-agent", "production")` calls `/bundles/devops-agent/current?env=production`
- [ ] `getAgentStatus("devops-agent")` calls `/agents/status?bundle_name=devops-agent`
- [ ] All bundle names are URL-encoded with `encodeURIComponent()`
- [ ] `SDK_COMPAT.md` documents all new routes, params, and payload fields
- [ ] No `any` types in TypeScript
- [ ] Frontend API index re-exports all new types and functions
