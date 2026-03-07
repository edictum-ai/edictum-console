# SPEC: edictum-docs

> Unified documentation site for the edictum ecosystem.
> Built with Fumadocs (Next.js). Dark-first, amber brand. LLM-ready from day one.

## Why

1. **Current docs are invisible to AI.** MkDocs Material at `docs.edictum.dev` serves HTML that LLMs can partially read, but there's no `llms.txt`, no `llms-full.txt`, no per-page markdown endpoints, no "Copy as Markdown" button. Console docs (27 pages in `edictum-console/docs/`) aren't published at all.

2. **Competitor docs are a black hole.** Faramesh (direct competitor) uses a Framer SPA — `WebFetch` returns an empty JS shell, `/llms.txt` returns 404. Every LLM asked about agent governance will have edictum docs in context and nothing from competitors.

3. **Brand consistency.** Current MkDocs site uses the default Material purple theme. It doesn't match edictum.ai's dark + amber identity. Docs should feel like a natural extension of the main site.

4. **Two doc sets, one product.** Core library docs (53 pages) and console docs (27 pages) live in separate repos with no unified experience. Users shouldn't care which repo a feature lives in.

## Hard Rules

- **No hallucinated content.** Every code example must be tested. Every API reference must match the actual codebase. Every claim must have a source.
- **Docs, code, or it didn't happen.** If it's not verified against the source repo, it doesn't ship.
- **Brand-accurate.** Colors, typography, and tone match edictum.ai exactly. Design tokens come from the hub's `globals.css`, not from guessing.

## Tech Stack

| Layer | Choice | Source |
|-------|--------|--------|
| Framework | **Fumadocs** (`fumadocs-mdx` + `fumadocs-ui` + `fumadocs-core`) | [fumadocs.dev](https://fumadocs.dev) |
| Runtime | **Next.js 15+ App Router** | Fumadocs requirement |
| Styling | **Tailwind CSS v4** + Fumadocs CSS preset | [fumadocs.dev/docs/ui/theme](https://fumadocs.dev/docs/ui/theme) |
| Content | **MDX** via `fumadocs-mdx` | Source of truth for all pages |
| Search | **Orama** (Fumadocs built-in default) | Zero-config, client-side |
| Hosting | **Vercel** (free tier, open-source) | Auto-deploy on push |
| Package manager | **pnpm** | Project standard |
| Node | **22+** | Fumadocs requirement |

## Brand Theme

Design tokens extracted from `edictum-hub/app/globals.css` (verified):

```css
/* edictum brand — dark mode (default) */
:root {
  --background: #111318;        /* body bg */
  --foreground: #f8fafc;        /* body text */
  --accent: #f59e0b;            /* amber CTA, highlights */
  --danger: #ff4444;
  --muted: #94a3b8;             /* secondary text */
  --surface: #1a1e28;           /* cards, code blocks */
  --surface-hover: #1e2230;
  --border-color: #252a35;      /* borders */
  --foreground-secondary: #94a3b8;
  --foreground-tertiary: #64748b;
}

/* light mode */
:root:not(.dark) {
  --background: #f8fafc;
  --foreground: #0f172a;
  --danger: #dc2626;
  --surface: #ffffff;
  --surface-hover: #f1f5f9;
  --border-color: #e2e8f0;
  --foreground-secondary: #475569;
  --foreground-tertiary: #94a3b8;
}
```

### Fumadocs CSS Variable Mapping

Map edictum tokens to Fumadocs `--color-fd-*` variables (from [Fumadocs theming docs](https://fumadocs.dev/docs/ui/theme)):

```css
@theme {
  /* Light mode */
  --color-fd-background: #f8fafc;
  --color-fd-foreground: #0f172a;
  --color-fd-muted: #f1f5f9;
  --color-fd-muted-foreground: #475569;
  --color-fd-popover: #ffffff;
  --color-fd-popover-foreground: #0f172a;
  --color-fd-card: #ffffff;
  --color-fd-card-foreground: #0f172a;
  --color-fd-border: #e2e8f0;
  --color-fd-primary: #f59e0b;           /* amber accent */
  --color-fd-primary-foreground: #111318;
  --color-fd-secondary: #f1f5f9;
  --color-fd-secondary-foreground: #0f172a;
  --color-fd-accent: #f1f5f9;
  --color-fd-accent-foreground: #0f172a;
  --color-fd-ring: #f59e0b;             /* amber focus ring */
}

.dark {
  --color-fd-background: #111318;
  --color-fd-foreground: #f8fafc;
  --color-fd-muted: #1a1e28;
  --color-fd-muted-foreground: #94a3b8;
  --color-fd-popover: #1a1e28;
  --color-fd-popover-foreground: #f8fafc;
  --color-fd-card: #1a1e28;
  --color-fd-card-foreground: #f8fafc;
  --color-fd-border: #252a35;
  --color-fd-primary: #f59e0b;           /* amber accent */
  --color-fd-primary-foreground: #111318;
  --color-fd-secondary: #1e2230;
  --color-fd-secondary-foreground: #f8fafc;
  --color-fd-accent: #1e2230;
  --color-fd-accent-foreground: #f8fafc;
  --color-fd-ring: #f59e0b;             /* amber focus ring */
}
```

### Typography

- **Sans:** Geist Sans (same as edictum.ai — `var(--font-geist-sans)`)
- **Mono:** Geist Mono (same as edictum.ai — `var(--font-geist-mono)`)

## LLM-Ready Features

All verified against [Fumadocs AI & LLMs docs](https://fumadocs.dev/docs/integrations/llms):

### 1. `/llms.txt` — Auto-generated index

```ts
// app/llms.txt/route.ts
import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

export const revalidate = false;

export function GET() {
  return new Response(llms(source).index());
}
```

### 2. `/llms-full.txt` — Full docs for AI consumption

```ts
// app/llms-full.txt/route.ts
import { source } from '@/lib/source';
import { getLLMText } from '@/lib/get-llm-text';

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);
  return new Response(scanned.join('\n\n'));
}
```

### 3. `getLLMText` helper

```ts
// lib/get-llm-text.ts
import { source } from '@/lib/source';
import type { InferPageType } from 'fumadocs-core/source';

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title}
URL: ${page.url}

${processed}`;
}
```

Requires `includeProcessedMarkdown` in source config:

```ts
// source.config.ts
import { defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});
```

### 4. `*.mdx` endpoints — Per-page markdown

```ts
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/docs/:path*.mdx',
        destination: '/llms.mdx/:path*',
      },
    ];
  },
};
```

### 5. "Copy Markdown" button — Fumadocs `Page Actions`

Built-in component on `DocsPage`. Renders "Copy Markdown" + dropdown with options.

### 6. Context7 submission

After launch, submit to [context7.com](https://context7.com) for indexing in Cursor/Claude Code/VS Code.

## Custom Components (to build)

### AI Prompt Box (Vercel-style)

Inspired by [vercel.com/docs/production-checklist](https://vercel.com/docs/production-checklist). A pre-written, page-specific prompt users can copy into any LLM.

**Implementation:** MDX component triggered by frontmatter:

```mdx
---
title: Quickstart
aiPrompt: |
  I'm setting up edictum for runtime contract enforcement on my AI agent.
  I'm following the quickstart at https://docs.edictum.ai/quickstart.
  Help me write my first contract YAML and integrate it with my agent framework.
  Ask me which framework I'm using (LangChain, OpenAI Agents, CrewAI, etc.)
  so you can show the right adapter code.
---
```

Renders as a collapsible "AI Assistance" box with "Copy prompt" button.

### "Chat in Claude.ai" link

Dropdown option alongside "Copy page as Markdown" and "Open Markdown":

```
Copy page as Markdown
Open Markdown (.mdx)
Chat in Claude.ai
```

"Chat in Claude.ai" opens `https://claude.ai/new?q={url-encoded page markdown}`.

## Information Architecture

Unified navigation — user doesn't need to know which repo a feature comes from.

```
docs.edictum.ai/
├── /                           # Home — what is edictum, pick your path
├── /quickstart                 # 5-min first contract
├── /concepts/
│   ├── how-it-works            # Pipeline, decision-to-action seam
│   ├── contracts               # Pre/post/session/sandbox
│   ├── principals              # Identity context
│   ├── observe-mode            # Shadow testing
│   └── sandbox-contracts       # Allowlist-based
├── /contracts/
│   ├── yaml-reference          # Full YAML schema
│   ├── operators               # Condition operators
│   ├── templates               # Built-in templates
│   └── patterns/               # Access control, data protection, etc.
├── /adapters/
│   ├── overview                # Comparison table
│   ├── langchain
│   ├── openai-agents
│   ├── crewai
│   ├── agno
│   ├── semantic-kernel
│   ├── claude-sdk
│   ├── nanobot
│   └── google-adk
├── /console/                   # Console-specific (from edictum-console)
│   ├── setup                   # Docker Compose, first run
│   ├── dashboard               # UI walkthrough
│   ├── contracts               # Managing contracts in console
│   ├── approvals               # HITL workflows
│   ├── notifications/          # Telegram, Slack, Discord, Email, Webhook
│   ├── fleet-monitoring        # Agent monitoring
│   ├── agent-assignment        # Bundle assignment rules
│   ├── self-hosting            # Production deployment
│   └── api-reference           # Auto-generated from OpenAPI spec
├── /guides/
│   ├── writing-contracts       # Requirement to YAML workflow
│   ├── testing-contracts       # edictum test, CI integration
│   ├── custom-operators
│   ├── python-hooks            # @precondition/@postcondition
│   ├── observability           # OTel, audit sinks
│   └── adversarial             # Security testing patterns
├── /cli/                       # CLI reference
│   └── commands                # validate, check, diff, replay, test
├── /security/
│   └── security-model          # Threat model, defense layers
├── /use-cases                  # 6 domains with complete YAML
├── /changelog                  # Version history
└── /roadmap                    # What's coming
```

## Source Content Mapping

| Docs section | Source repo | Source path |
|-------------|------------|-------------|
| `/concepts/*`, `/contracts/*`, `/adapters/*`, `/guides/*`, `/cli/*` | `edictum` (core) | `docs/` (53 files) |
| `/console/*` | `edictum-console` | `docs/` (27 files) |
| `/security/*` | Both | Merge security docs |
| `/use-cases`, `/changelog`, `/roadmap` | `edictum` (core) | `docs/` |
| `/quickstart` | New | Unified quickstart covering both core and console |

## Migration Strategy

### Phase 1: Scaffold + Core Docs (ship first)
1. Create `edictum-docs` repo
2. `pnpm create fumadocs-app` with Next.js
3. Apply edictum brand theme (CSS variables above)
4. Migrate 53 core library docs (`.md` → `.mdx`, add frontmatter)
5. Set up LLM routes (`llms.txt`, `llms-full.txt`, `*.mdx`)
6. Build AI Prompt Box component
7. Deploy to Vercel → `docs.edictum.ai`
8. Submit to Context7

### Phase 2: Console Docs
1. Migrate 27 console docs under `/console/*`
2. Generate OpenAPI reference for console API
3. Unified search across both

### Phase 3: Polish
1. Per-page AI prompts on key pages (quickstart, adapters, console setup)
2. "Chat in Claude.ai" dropdown option
3. Cross-references between core and console docs
4. Retire `docs.edictum.dev` (redirect to `docs.edictum.ai`)

## Project Structure

```
edictum-docs/
├── app/
│   ├── layout.tsx              # RootProvider, fonts, metadata
│   ├── page.tsx                # Home page
│   ├── docs/
│   │   ├── layout.tsx          # DocsLayout with sidebar tree
│   │   └── [[...slug]]/
│   │       └── page.tsx        # Dynamic docs page
│   ├── llms.txt/
│   │   └── route.ts            # llms.txt endpoint
│   ├── llms-full.txt/
│   │   └── route.ts            # llms-full.txt endpoint
│   ├── llms.mdx/
│   │   └── [...path]/
│   │       └── route.ts        # Per-page MDX endpoint
│   └── api/
│       └── search/
│           └── route.ts        # Search endpoint
├── content/
│   └── docs/                   # All MDX content
│       ├── index.mdx
│       ├── quickstart.mdx
│       ├── concepts/
│       ├── contracts/
│       ├── adapters/
│       ├── console/
│       ├── guides/
│       ├── cli/
│       ├── security/
│       └── meta.json           # Navigation structure
├── components/
│   ├── ai-prompt-box.tsx       # Vercel-style AI assistance component
│   └── chat-in-claude.tsx      # "Chat in Claude.ai" button
├── lib/
│   ├── source.ts               # Fumadocs source configuration
│   ├── get-llm-text.ts         # LLM text extraction
│   └── layout.shared.ts        # Shared layout options
├── source.config.ts            # fumadocs-mdx config
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── app/globals.css             # Brand theme overrides
```

## Shared Header with edictum.ai

Docs nav should include the same links as the main site:

```
[Edictum logo] | Docs | Templates | Deploy | Security | Compare | GitHub
```

"Docs" is active/highlighted. Other links go to `edictum.ai/*`. This creates continuity — the docs feel like part of the main site.

## Open Questions

1. **Domain:** `docs.edictum.ai` (subdomain) — need to configure DNS on Vercel.
2. **Repo location:** `~/project/edictum-docs` (new repo) or monorepo with hub?
3. **Content sync:** Copy MDX files into docs repo, or use git submodules / build-time fetch from core and console repos?
4. **OpenAPI spec:** Does the console export an OpenAPI JSON? If so, Fumadocs has a built-in OpenAPI docs generator.

## References

- [Fumadocs Quick Start](https://fumadocs.dev/docs/ui)
- [Fumadocs Theming](https://fumadocs.dev/docs/ui/theme) — CSS variables, color presets, dark mode
- [Fumadocs AI & LLMs](https://fumadocs.dev/docs/integrations/llms) — llms.txt, llms-full.txt, *.mdx, Accept header, Page Actions
- [Fumadocs Page Actions](https://fumadocs.dev/docs/ui/page#page-actions) — Copy Markdown button
- [llms.txt specification](https://llmstxt.org/)
- [Vercel Docs Production Checklist](https://vercel.com/docs/production-checklist) — AI Assistance prompt box pattern
- [shadcn/ui docs](https://ui.shadcn.com/docs) — Fumadocs in production (Copy Page dropdown)
- [Anthropic Claude API Docs](https://platform.claude.com/docs) — Mintlify "Copy page" pattern (Copy as Markdown, Open Markdown, Chat in Claude.ai)
- [Context7](https://context7.com/) — LLM docs indexing service
- [edictum-hub globals.css](../edictum-hub/app/globals.css) — Brand design tokens (verified)
