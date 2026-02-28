# Cross-Repo Conventions

> These conventions apply to ALL Edictum repos.
> Source of truth: edictum core's CLAUDE.md and .docs-style-guide.md.
> All repos must follow these rules for consistency.

## Terminology (Binding)

| Concept | Use | DO NOT Use |
|---------|-----|------------|
| YAML governance constructs | **contract** / **contracts** | rules, policies, guards, checks |
| What Edictum does | **enforces contracts** | governs, guards, protects, secures |
| Call blocked by contract | **denied** / **deny** | blocked, rejected, prevented, stopped |
| Call allowed by contract | **allowed** / **allow** | passed, approved (except HITL), permitted |
| Runtime check sequence | **pipeline** | engine, evaluator, processor, middleware |
| What agents do | **tool call** / **tool calls** | function call, action, operation |
| Framework integration layer | **adapter** / **adapters** | integration, plugin, connector, driver |
| Shadow-testing mode | **observe mode** | shadow mode, dry run, passive mode |
| Identity context | **principal** | user (in governance context), identity, caller |
| Postcondition output | **finding** / **findings** | result, detection, alert, violation |
| YAML file of contracts | **contract bundle** | policy file, rule file, config |
| What Edictum IS | **runtime contract enforcement for agent tool calls** | governance framework, safety library, guardrails |

**No exceptions.** Check code, comments, docstrings, CLI output, docs, CHANGELOG, README, commit messages.

**Do NOT use metaphors:** gatekeeper, guardian, shield, firewall, sentinel, watchdog.
**DO use:** "hard boundary," "enforcement point," "the check between decision and action."

## Code Conventions (All Python Repos)

### Required in every .py file
```python
from __future__ import annotations
```

### Style
- Python 3.11+
- Frozen dataclasses for immutable data
- Type hints everywhere (function signatures, class attributes)
- All pipeline, session, audit, and API methods are async
- Files should stay under 200 lines; flag files exceeding 250 lines
- Zero runtime deps in edictum core; optional deps via extras

### Naming
- Snake_case for functions, methods, variables
- PascalCase for classes
- UPPER_CASE for constants and enum members
- Private methods prefixed with underscore

### Dependencies
- edictum core: zero runtime deps. Optional via `pip install edictum[yaml]`, `edictum[server]`, etc.
- edictum-server: FastAPI, SQLAlchemy 2.0 async, asyncpg, redis, pynacl, pyjwt, httpx
- nanobot-governed: edictum[server] + upstream nanobot deps

## Testing Conventions

### All repos
- pytest + pytest-asyncio
- `asyncio_mode = "auto"` in pytest config
- Test happy path AND error cases
- No flaky tests (no sleep, no real network calls in unit tests)

### edictum core (additional)
- 97%+ coverage target
- Behavior tests for every public API parameter in `tests/test_behavior/`
- Adapter parity tests: `tests/test_adapter_parity.py`
- Docs-code sync tests: `tests/test_docs_sync.py`

### edictum-server (additional)
- In-memory SQLite + fakeredis for tests
- Auth dependencies overridden in conftest
- Tenant isolation tested between tenant A and B

## Commit Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- No Co-Authored-By lines
- Short subject line (imperative mood)
- Body for context when needed

## Code Review Workflow

Apply these checks to every PR (adapted from edictum core's code-reviewer agent):

### 1. Tier Boundary (CRITICAL)
- Core code (`src/edictum/`) NEVER imports from `ee/`
- `ee/` imports from core freely
- Server SDK (`src/edictum/server/`) is in the public repo (ADR-007)

### 2. Terminology
- Check ALL changed files against the terminology table above
- Check: code comments, docstrings, CLI output, error messages, YAML message fields
- No marketing language ("powerful," "seamless," "revolutionary," "robust," "elegant")

### 3. API Design (edictum core)
- Every parameter has an observable effect with a test
- Collection parameters document merge semantics
- Deny decisions propagate end-to-end through all adapters
- Callbacks fire exactly once

### 4. Adapter Parity (edictum core)
- If touching any adapter, verify all 7 adapters handle same features
- Run `pytest tests/test_adapter_parity.py -v`

### 5. Security
- No hardcoded secrets or credentials
- No command injection (subprocess with shell=True + untrusted input)
- No unsafe deserialization
- Parameterized queries only (no SQL injection)

### 6. Agentic Engineering
- Tool call validation: every parameter checked and tested
- Principal verification: actually evaluated, not ignored
- Session exhaustion: limits enforced and tested
- Observe mode safety: never denies or modifies tool calls
- Audit completeness: every code path emits an audit event
- Deterministic enforcement: same input = same result

### Priority for findings
1. **Critical**: tier boundary violations, security issues, broken contract enforcement
2. **Warning**: missing tests, terminology violations, adapter parity gaps
3. **Info**: file size, naming, minor improvements

## Documentation Conventions

### Writing style
- Lead with the problem, then the solution
- Show, don't describe (working examples first)
- No marketing language
- Short paragraphs (2-3 sentences max)
- Code examples must be copy-pasteable

### Page structure
1. Opening (1-2 sentences, the problem)
2. Example (working code within first screen)
3. When to use this (concrete scenarios)
4. Explanation (how it works)
5. Reference (full details, edge cases)
6. Next steps (links)

## Pre-Merge Checklist (All Repos)

```bash
# Python repos
pytest tests/ -v
ruff check src/ tests/

# edictum core (additional)
pytest tests/test_docs_sync.py -v
python -m mkdocs build --strict
# If touching adapters:
pytest tests/test_adapter_parity.py -v

# edictum-server (additional)
mypy src/

# JS/TS repos (edictum-hub)
pnpm lint
pnpm build
```

## Architecture Rules

- **The server NEVER evaluates contracts** (ADR-001)
- **SSE for agent push, WebSocket for dashboard** (ADR-002, ADR-014)
- **Ed25519 signing is mandatory** (ADR-003)
- **Hub is the frontend, server is API-only** (ADR-008)
- **Neon PostgreSQL for storage** (ADR-009)
- **Server SDK lives in public edictum repo** at `src/edictum/server/` (ADR-007)
- **Copy + track from Hub, not live link** (ADR-012)
