# Slack Interactive Approvals — Implementation Order

## Prerequisites (done)
- [x] `docs/slack-app-manifest.json` — manifest template
- [x] `docs/slack-app-setup.md` — user setup guide

## Sequence

| Order | File | What | Test before moving on |
|-------|------|------|----------------------|
| 1 | `01-BACKEND.md` | Split notification_service, SlackAppChannel, route, manifest endpoint, wiring | `ruff check src/` + `pytest tests/` green + `curl` manifest endpoint |
| 2 | `02-TESTS.md` | Unit, integration, and adversarial tests (9 security tests) | `pytest tests/ -v` all green, `pytest -m security` includes new tests |
| 3 | `03-FRONTEND.md` | ChannelType, config fields, dropdown labels, validation | Browser: create Slack (Interactive) channel, both themes |

Each prompt is self-contained — read the spec (`00-SPEC.md`) once, then execute prompts in order.
