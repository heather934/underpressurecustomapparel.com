# Installed Skills — Notes

Source: [aemerson-commits/shareable-skills](https://github.com/aemerson-commits/shareable-skills) (development-pipeline subset).

Normal working order:

```
/grill-me  →  /research-gate  →  /write-plan  →  build  →  /review-impl
```

`/persistent-issue` is separate — it triggers when a fix attempt fails, not as part of the happy path.

Most of these fire on their own when the conversation matches their trigger conditions; you don't have to type the slash command.

---

## `/grill-me`

**Does:** Interviews you about a new feature before any code is written. Works a "design tree" (audience, success criteria, data shape, interaction model, integration points, edge cases, scope) in batched rounds — asks everything answerable right now, waits for your answers, then asks the next round. Ends with an Intent Summary.

**Fires when:** You describe a new feature with ambiguous scope, or explicitly type `/grill-me`.

**Skips itself when:** It's a bug fix, you hand it a detailed spec, or you say "just do it."

**Feeds into:** `/research-gate` (the Intent Summary is its input).

---

## `/research-gate`

**Does:** Blocks implementation until constraints are mapped. Dispatches parallel research agents to check codebase gotchas, existing patterns, external API limits, prior art, and state/race hazards, then presents findings as Constraints / Patterns / Gotchas / Unknowns plus a recommended approach with explicit **Always / Ask / Never** rules.

**Fires when:** A feature touches 3+ files, involves an external API, or has unknown constraints (CSP, auth, data format). Trigger phrases: "new view," "integrate with," "build a system."

**Skips itself when:** Single-file fix or cosmetic change.

**Feeds into:** `/write-plan` for anything spanning 5+ files or multiple phases; otherwise straight to implementation.

---

## `/write-plan`

**Does:** Writes a structured plan to `docs/plans/YYYY-MM-DD-{slug}.md` — exact file paths, real code blocks (not "add validation," the actual code), "Done When" acceptance criteria, and for 3+ task plans, a mandatory Agent Orchestration Spec (file-ownership map, stages, which agent owns what, merge order).

**Fires when:** After `/research-gate` clears, for features spanning 5+ files or multiple projects, or when you ask for a plan.

**Skips itself when:** Single-file fixes, CSS-only changes, config updates, or anything `/research-gate` already flagged as "no blocking constraints."

**Depends on (not installed):** references `cascade-orchestration` (for stage/fan-out patterns) and `model-selection` (for which model tier to assign each agent). Without those, the orchestration section is prose with no pattern library behind it.

---

## `/review-impl`

**Does:** Dispatches independent reviewer agents that read the actual diff — not your summary of it. Three parallel reviewers (Spec Compliance, Code Quality, Security & Auth) grade against a weighted rubric (Functionality 40%, Design 25%, Data integrity 20%, Performance 15%) for an A–F score. Optional follow-on phases: visual verification, consumer-contract check, mutation-endpoint audit, write-cycle test.

**Fires when:** After completing a feature touching 3+ files, anything involving auth/security/financial data, or when you say "review this."

**Skips itself when:** Single-file fixes, CSS changes, config updates.

**Known gap in this repo:** Phase 4 (deterministic e2e runner) expects an `e2e-verify` script + per-view manifest convention that doesn't exist in this skill set or this codebase — that phase won't run as-is. The Playwright design-judgment step and the rest of the review are unaffected.

---

## `/persistent-issue`

**Does:** Router for "I fixed it and it's still broken." Classifies the failure into one of five categories — Wrong Root Cause, Wrong Layer, Multiple Factors, Intermittent, Regression — builds an Evidence Document (symptom, prior attempts, what's verified vs. assumed), and routes to the matching diagnostic team. With `--cascade`, auto-escalates through up to 3 teams without stopping.

**Fires when:** You say "not fixed," "still broken," "same error," "tried that," "didn't work."

**Depends on (not installed):** the five diagnostic teams it routes to (`deep-root-cause`, `full-stack-trace`, `isolation-test`, `temporal-forensics`, `regression-bisect`) aren't copied into this project yet. The router will classify correctly but has nowhere to dispatch — worth adding if `/persistent-issue` gets used often.

---

## Recommended next additions (not installed — see PR #4 discussion)

Based on this codebase specifically (two KV namespaces with ad-hoc string keys, an admin-token-gated write API, PayPal IPN handling real money, a React color/product previewer):

- **`cascade-orchestration`** + **`model-selection`** — direct dependencies of `/write-plan`'s orchestration section.
- **`schema-check`** — guards against the KV-key/namespace drift already present between `UP_DATA` and `UP_STORE_DATA`.
- **`pre-merge-review`** — deeper security pass, warranted given the payment + admin-auth surface.
- **`webapp-testing`** — Playwright toolkit, fits the color previewer / admin panel UI.
- **`debug-collaborate`** — companion to `/persistent-issue` for a solo dev without a second reviewer.
