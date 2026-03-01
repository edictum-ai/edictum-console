# Audit 6 — Code Quality & Architecture

**Context:** A security product with messy internals is harder to audit, harder to patch,
and more likely to have hidden bugs. This audit ensures the codebase is maintainable
and that the DDD layer rules are enforced.
Save findings to `audits/results/AUDIT-6-results.md`.

---

## Step 1 — Test coverage

```bash
cd ~/workspace/edictum-console
source .venv/bin/activate

# Full test suite with coverage
pytest --cov=edictum_server --cov-report=term-missing --cov-report=html:audits/results/coverage/ \
  -v 2>&1 | tee audits/results/coverage.txt

# Count: total tests, passed, failed, coverage %
# Flag any module under 70% coverage that is in the auth or security path
```

Modules that must be ≥ 80% covered:
- `auth/`
- `services/approval_service.py`
- `services/signing_service.py`
- `routes/auth.py`
- `routes/approvals.py`
- `routes/stream.py`

---

## Step 2 — File size (>200 lines = needs review)

```bash
cd ~/workspace/edictum-console/src

find . -name "*.py" | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 200 ]; then
    echo "$lines $f"
  fi
done | sort -rn

# Same for frontend
cd ~/workspace/edictum-console/dashboard/src
find . -name "*.tsx" -o -name "*.ts" | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 200 ]; then
    echo "$lines $f"
  fi
done | sort -rn
```

---

## Step 3 — DDD layer rules

The rule: services never import from routes. Routes never contain business logic.

```bash
cd ~/workspace/edictum-console/src

# Services importing from routes (forbidden)
grep -rn "from edictum_server.routes" edictum_server/services/
grep -rn "import routes" edictum_server/services/

# Business logic in routes (routes > 20 lines per function)
python3 << 'EOF'
import ast, os

for root, dirs, files in os.walk("edictum_server/routes"):
    for f in files:
        if not f.endswith(".py"): continue
        path = os.path.join(root, f)
        tree = ast.parse(open(path).read())
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                length = node.end_lineno - node.lineno
                if length > 20:
                    print(f"{path}:{node.lineno} {node.name}() — {length} lines")
EOF
```

---

## Step 4 — Type completeness

```bash
cd ~/workspace/edictum-console
source .venv/bin/activate

# Mypy strict — every error is a potential runtime bug
mypy src/ --strict --ignore-missing-imports 2>&1 | tee audits/results/mypy-strict.txt

# Count errors by file
mypy src/ --strict --ignore-missing-imports 2>&1 | grep "error:" | \
  sed 's/:.*//' | sort | uniq -c | sort -rn
```

---

## Step 5 — Async correctness

```bash
cd ~/workspace/edictum-console/src

# Blocking calls inside async functions (will block the event loop)
grep -rn "time\.sleep\|\.read()\b\|open(" edictum_server/ --include="*.py" | \
  grep -v "test\|#.*time.sleep"

# Missing await on coroutines (floating promises in Python)
grep -rn "asyncio\.create_task\|ensure_future" edictum_server/ --include="*.py"
# Each create_task must be stored and eventually awaited or cancelled on shutdown
```

---

## Step 6 — Error handling completeness

```bash
cd ~/workspace/edictum-console/src

# Bare except clauses (catch-all can hide bugs)
grep -rn "except:" edictum_server/ --include="*.py" | grep -v "test"

# Exception swallowing (catching and not logging)
grep -rn -A 2 "except.*:" edictum_server/ --include="*.py" | grep -B 1 "pass$"

# Check that all 500 errors are logged
grep -rn "raise HTTPException" edictum_server/ --include="*.py" | \
  grep "status_code=500"
```

---

## Step 7 — Migrations completeness

```bash
cd ~/workspace/edictum-console

# Are all models represented in migrations?
# List tables in migration vs tables in models.py
grep "class.*Base" src/edictum_server/db/models.py
grep "__tablename__" src/edictum_server/db/models.py

# List tables created in alembic migrations
grep "op.create_table" alembic/versions/*.py

# Any table in models.py not in migrations is a bug
```

---

## Report format

```
# Audit 6 Results — Code Quality

## Test Coverage
- Overall: X%
- Auth modules: X%
- Approval service: X%
- Signing service: X%
- Modules below 80% threshold: (list)

## File sizes
- Files over 200 lines (backend): (list)
- Files over 200 lines (frontend): (list)

## DDD violations
- Services importing routes: (list)
- Route functions > 20 lines: (list)

## Type errors
- Mypy strict errors: X (list by file)

## Async issues
- Blocking calls in async context: (list)
- Untracked create_task: (list)

## Error handling
- Bare excepts: (list)
- Exception swallowing: (list)

## Migration gaps
- Tables in models not in migrations: (list)

## Recommendations
```
