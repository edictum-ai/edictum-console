# Dev Notes — Edictum Console Dashboard

> Practical notes for development and testing sessions.
> Things that are easy to forget between runs.

## Running the Stack

### Backend (Docker)

```bash
# Start everything (Postgres + Redis + server)
docker compose up -d

# Check status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# View server logs
docker logs -f edictum-console-server-1

# Server runs on http://localhost:8000
```

### Frontend (Vite dev server)

```bash
cd dashboard
pnpm dev
# Runs on http://localhost:5173 (or next available port)
# Proxies /api → http://localhost:8000 (see vite.config.ts)
```

### Seed Demo Data

After bootstrap, seed the database with a demo contract bundle:

```bash
# Install httpx if needed
pip install httpx

# Run the seed script (uses admin@example.com / TestPassword123)
python scripts/seed_demo_bundle.py
```

This uploads an 8-contract devops-agent bundle and deploys it to development. The Contracts page will then show real data instead of an empty state.

### Admin Password Reset

The bootstrap wizard creates the admin via `POST /api/v1/setup`. The password is NOT stored in any env file — it's set interactively. Between sessions you may not know the password.

**Quick reset:**

```bash
# 1. Generate a bcrypt hash for your desired password
docker exec edictum-console-server-1 python -c "
import bcrypt, hashlib
password = 'TestPassword123'
prehashed = hashlib.sha256(password.encode()).hexdigest().encode()
hashed = bcrypt.hashpw(prehashed, bcrypt.gensalt(rounds=12)).decode()
print(hashed)
"

# 2. Update the DB (replace the hash with the output above)
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c \
  "UPDATE users SET password_hash = '<HASH_FROM_STEP_1>' WHERE email = 'admin@example.com';"
```

**One-liner (resets to `TestPassword123`):**

```bash
HASH=$(docker exec edictum-console-server-1 python -c "
import bcrypt, hashlib
p = hashlib.sha256(b'TestPassword123').hexdigest().encode()
print(bcrypt.hashpw(p, bcrypt.gensalt(rounds=12)).decode())
") && docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "UPDATE users SET password_hash = '$HASH' WHERE email = 'admin@example.com';"
```

**Nuclear option (full DB reset — re-triggers bootstrap):**

```bash
docker compose down -v   # destroys volumes
docker compose up -d     # fresh start, no users → bootstrap wizard shows
```

### Useful DB Queries

```bash
# Check existing users
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT email, is_admin FROM users;"

# Check API keys
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT key_prefix, env, label, revoked_at FROM api_keys;"

# Check bundles
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT version, revision_hash, uploaded_by, created_at FROM bundles ORDER BY version;"

# Check deployments
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT env, bundle_version, deployed_by, created_at FROM deployments ORDER BY created_at DESC;"

# Check approvals
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT id, agent_id, tool_name, status, created_at FROM approvals ORDER BY created_at DESC LIMIT 10;"

# Check events
docker exec edictum-console-postgres-1 psql -U postgres -d edictum -c "SELECT agent_id, tool_name, verdict, mode, timestamp FROM events ORDER BY timestamp DESC LIMIT 10;"
```

### Test Login via curl

```bash
# Login (returns Set-Cookie header)
curl -v -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"TestPassword123"}'

# Check session
curl -s http://localhost:8000/api/v1/auth/me \
  -H "Cookie: session=<token_from_above>"

# Health (no auth)
curl -s http://localhost:8000/api/v1/health
```

---

## Implementation Status

### What's Built (code exists, functional)

| View | Route | File | Status |
|------|-------|------|--------|
| View 0: Bootstrap Wizard | `/dashboard/setup` | `pages/bootstrap.tsx` | Built, tested |
| View 1: Login | `/dashboard/login` | `pages/login.tsx` | Built, tested |
| Sidebar | (all authenticated routes) | `components/sidebar.tsx` | Built, tested |
| Dashboard Layout | (wrapper) | `components/dashboard-layout.tsx` | Built |
| Auth Guard | (wrapper) | `components/auth-guard.tsx` | Built |
| Theme Toggle | (sidebar) | `components/theme-toggle.tsx` | Built |

### What's Designed but NOT Built (placeholder pages)

| View | Route | Design Status | Implementation |
|------|-------|---------------|----------------|
| View 2: Onboarding Guide | (overlay on dashboard) | Designed in DASHBOARD.md | **Not built** — no page exists |
| View 3: Dashboard Home | `/dashboard` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |
| View 4: Events Feed | `/dashboard/events` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |
| View 5: Approvals Queue | `/dashboard/approvals` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |
| View 6: Contracts | `/dashboard/contracts` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |
| View 7: API Keys | `/dashboard/keys` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |
| View 8: Settings | `/dashboard/settings` | Designed in DASHBOARD.md | **Placeholder** — "Coming soon" |

### Shared Infrastructure Built

| Component | File | Notes |
|-----------|------|-------|
| API client | `lib/api.ts` | All endpoints typed: health, auth, keys, bundles, events, approvals, stats |
| SSE helper | `lib/sse.ts` | Not yet reviewed |
| Utilities | `lib/utils.ts` | `cn()` classname merge |
| useAuth hook | `hooks/use-auth.ts` | Session check via `GET /auth/me` |
| useHealth hook | `hooks/use-health.ts` | Health check for bootstrap status |
| shadcn/ui components | `components/ui/` | badge, button, card, input, label, separator, tooltip, dialog, tabs, select, textarea, switch, table, dropdown-menu, scroll-area, alert-dialog |

---

## Testing Log

### View 0: Bootstrap Wizard — Tested 2026-02-27

| Test | Result | Notes |
|------|--------|-------|
| Step 1: Welcome screen renders | PASS | Centered card, step dots, "Get Started" button |
| Step 2: Admin form renders | PASS | Email, password (min 12), confirm password fields |
| Back button works | PASS | Returns to step 1 |
| Short password validation | PASS | Browser native `minLength` fires |
| Password mismatch validation | PASS | "Passwords don't match" error in red |
| Step 3: Capabilities preview | NOT TESTED | Couldn't complete — admin already exists (409) |
| Step 4: Done / redirect to login | NOT TESTED | Same — already bootstrapped |
| 409 on already-bootstrapped server | NOT TESTED | Would need fresh DB |

### View 1: Login — Tested 2026-02-27

| Test | Result | Notes |
|------|--------|-------|
| Login page renders | PASS | Centered card, email/password, amber button, version footer |
| Invalid credentials | PASS | "Invalid email or password" (no email enumeration) |
| Loading state ("Signing in...") | PASS | Button disabled + text changes during API call |
| Successful login redirect | PASS | Redirects to `/dashboard` after login |
| Already authenticated → redirect | PASS | Navigating to `/login` when logged in → redirects to dashboard |
| Bootstrap check → redirect | PASS | If `bootstrap_complete: false`, redirects to setup wizard |
| Rate limiting (429) message | NOT TESTED | Would need to trigger S8 rate limiter |
| Version footer from health | PASS | Shows "v0.1.0" |

### Sidebar — Tested 2026-02-27

| Test | Result | Notes |
|------|--------|-------|
| All nav items render | PASS | Overview, Events, Approvals, Contracts, API Keys, Settings |
| Active item highlighting | PASS | Amber text on active route |
| User email shown | PASS | `admin@example.com` in sidebar footer |
| Theme toggle present | PASS | Sun/moon icon |
| Logout button | PASS | Clears session, redirects to login |
| Pending approval badge | NOT TESTED | No real approval data |

### Not Yet Tested

- Light mode rendering (theme toggle)
- Mobile/responsive layouts
- SSE real-time updates
- Views 2-8 (all placeholders)
- Network error handling (backend down)
- Multiple rapid logouts/logins
- Browser back/forward navigation
- Session expiry handling

---

## Architecture Notes

### Auth Flow

```
Login page → POST /auth/login → server sets HttpOnly cookie → redirect to /dashboard
                                                                    ↓
Dashboard → AuthGuard → GET /auth/me → 200: render │ 401: redirect to /login
                                                                    ↓
Logout → POST /auth/logout → server clears cookie → redirect to /login
```

### Password Hashing

- SHA256 pre-hash (to handle bcrypt's 72-byte limit)
- bcrypt with 12 rounds
- Implementation: `src/edictum_server/auth/local.py` → `LocalAuthProvider`

### Vite Proxy

`/api/*` → `http://localhost:8000` (configured in `vite.config.ts`). This means the frontend dev server talks to the Docker backend. Both must be running.

---

## Next Steps

The design methodology (DASHBOARD.md) calls for 5 mockup variations per view before building. The current gap is:

1. **Views 3-5** (Dashboard Home, Events, Approvals) — designed, need mockups + implementation
2. **Views 6-8** (Contracts, API Keys, Settings) — designed, need mockups + implementation
3. **View 2** (Onboarding Guide) — designed, needs implementation (overlay, not a route)
4. **Backend endpoints** — several new endpoints needed (see DASHBOARD.md "Backend Endpoints Needed" section)

All views have detailed designs in DASHBOARD.md with layout wireframes, component breakdowns, data flow, scale scenarios, and 5 mockup variation descriptions.
