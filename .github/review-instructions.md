# Review Template Instructions

Read `.github/review-template.md` and fill in the placeholders.

## Placeholder values

### Status

- `{status}`: One of `pass`, `warn`, `fail`
- `{status_icon}`: Use based on status:
  - pass: `✅`
  - warn: `⚠️`
  - fail: `🚨`
- `{status_summary}`: One line based on status:
  - pass: `**All checks passed.** No issues found in this PR.`
  - warn: `**{n} warning(s) found.** No critical issues, but some items need attention.`
  - fail: `**{n} issue(s) found** including **{c} critical**. These should be resolved before merging.`

### Sections

Only include a section if it has content. Remove the placeholder entirely if empty.

`{critical_section}` — if there are critical issues:
```markdown
### 🔴 Critical

> **These must be fixed before merging.**

| # | File | Issue | Violates |
|---|------|-------|----------|
| 1 | `src/edictum_server/foo.py:42` | Description of issue | [CLAUDE.md — ONE RULE](CLAUDE.md) |
| 2 | ... | ... | ... |

<details>
<summary>Details</summary>

**1. `src/edictum_server/foo.py:42` — Short title**

Description of the issue with context.

**Suggested fix:**
```python
# suggestion here
```

</details>
```

`{warnings_section}` — if there are warnings:
```markdown
### 🟡 Warnings

| # | File | Issue | Violates |
|---|------|-------|----------|
| 1 | `dashboard/src/pages/foo.tsx:15` | Description | [CLAUDE.md — shadcn](CLAUDE.md) |

<details>
<summary>Details</summary>

**1. `dashboard/src/pages/foo.tsx:15` — Short title**

Description with context.

</details>
```

`{suggestions_section}` — if there are suggestions:
```markdown
### 🔵 Suggestions

| # | File | Suggestion |
|---|------|------------|
| 1 | `src/edictum_server/bar.py` | Description |

<details>
<summary>Details</summary>

**1. `src/edictum_server/bar.py` — Short title**

Description.

</details>
```

`{clean_section}` — only when status is `pass`:
```markdown
### ✅ Checks passed

| Check | Status |
|-------|--------|
| Tenant isolation | ✅ Clean |
| Security boundaries | ✅ Clean |
| shadcn usage | ✅ Clean |
| ... | ... |
```

Only list checks that were actually applied (based on file types changed).

### File list

`{file_count}`: Number of files reviewed.

`{file_list}`: Markdown list of changed files with status:
```markdown
- ✏️ `src/edictum_server/routes/keys.py` (modified)
- ✨ `dashboard/src/pages/settings.tsx` (new)
- 🗑️ `dashboard/src/pages/mockups/index.tsx` (deleted)
```

### Checks applied

`{checks_applied}`: Comma-separated list of check categories that were relevant, e.g.:
`Tenant isolation · Security boundaries · shadcn compliance · Light/dark mode · Code quality`

## Rules

- Always start the comment with `<!-- edictum-console-review -->` (first line, no exceptions)
- Keep the summary table compact — details go in expandable sections
- Link "Violates" references to the actual file in the repo
- If zero issues: status is `pass`, include `{clean_section}`, omit issue sections
- If only warnings/suggestions: status is `warn`
- If any critical: status is `fail`
