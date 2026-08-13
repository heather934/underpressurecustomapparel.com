---
name: review-impl
description: Adversarial implementation review. Dispatches independent reviewer agents to verify spec compliance and code quality after feature implementation. Use after completing a multi-step feature, before committing or deploying.
---

# Review Implementation

Dispatch independent reviewer agents that read the actual code — not the implementer's summary. This catches the class of bugs where "it works in my head" doesn't match what was actually written (messaging auth bypass, buffer accumulation, etc.).

## Persona

Each reviewer agent should internalize these operating principles:

> You are an adversarial code reviewer. You trust nothing — not the implementer's summary, not the commit message, not the variable names. You read the diff like you're hunting for a vulnerability that will wake someone up at 3am.
>
> You check: auth on every handler (can null slip through?), input validation at system boundaries, error messages that leak internals, null/undefined propagation through call chains, race conditions in async flows, and whether the test actually tests the claim.
>
> You do NOT soften findings to be polite. "This will crash in production when email is null" is better than "you might want to consider adding a null check here." If you find nothing wrong, say "no issues found" plainly — do not invent problems to justify your existence.
>
> You never rubber-stamp. If you didn't read the file, say so. If a path is untestable from the diff alone, flag it as UNVERIFIED, not PASS.

## Arguments

- First argument (optional): Feature name or description of what was just implemented
- If a plan exists in `docs/plans/`, reference it automatically

## When to Use

- After completing any feature that touches 3+ files
- After any feature involving auth, security, or financial data
- After any feature with a plan document
- Before committing multi-step work
- When the user says "review this" or "check my work"

Skip for: single-file fixes, CSS changes, config updates.

## Grading Rubric

Each reviewer grades against weighted criteria (not just pass/fail):

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Functionality** | 40% | Does the feature work as specified? Missing requirements? Extra work not requested? |
| **Design consistency** | 25% | Follows existing patterns? Color tokens, spacing, component reuse? |
| **Data integrity** | 20% | Edge cases handled? Empty states? Error states? Loading states? Null/undefined safety? |
| **Performance** | 15% | No unnecessary re-renders? Bundle impact? API call efficiency? |

**Scoring**: Each dimension gets 1-5. Weighted total determines overall grade:
- **A (4.0+)**: Ship it — no issues or minor style nits only
- **B (3.0-3.9)**: Fix IMPORTANT issues, then ship
- **C (2.0-2.9)**: Significant issues — fix before commit
- **F (<2.0)**: Fundamental problems — re-evaluate approach

Each reviewer agent includes a score table in their output.

## Process

### Phase 1: Gather Context (parallel, model: "sonnet")

**SKIP this phase entirely when the orchestrator built (or closely supervised) the implementation in this same session** — it already holds the diff, the plan, and the conventions; re-deriving them burns 3 agents for nothing. Compile the context package inline (commit range, changed-file list, spec paths, known risk areas) and go straight to Phase 2. Proven equivalent on same-session reviews (same rigor, 3 fewer agents). Phase 1 exists for reviewing OTHER sessions' or agents' work cold.

When it does run, dispatch 3 context-gathering agents simultaneously (sonnet — mechanical reads, not judgement; the opus budget belongs to the Phase 2 reviewers):
- **Agent: Diff Analyzer** — Run `git diff --stat` and `git diff` to capture all changed files and actual code changes
- **Agent: Spec Reader** — Read the plan from `docs/plans/` (if exists) + TodoWrite list for intended scope
- **Agent: Pattern Scanner** — Read neighboring unchanged files to establish baseline patterns and conventions

All 3 agents report back. Main agent compiles context package for Phase 2 reviewers.

### Phase 2: Dispatch Reviewers (parallel)

Launch three agents simultaneously (all model: "opus"). Full prompt text for each agent is in [references/review-checklists.md](references/review-checklists.md).

**Agent A — Spec Compliance Reviewer**

Checks: (1) missing requirements — every spec line vs the code, TODO comments, implied error handling; (2) extra/unneeded work — over-engineering, features not in spec; (3) security gaps — auth, input validation, XSS, CORS; (4) data integrity — cache key patterns, IDs from config, date formatting.

Output: `## Spec Compliance: PASS / ISSUES FOUND` table with severity (CRITICAL / IMPORTANT / MINOR).

**Agent B — Code Quality Reviewer**

Checks: (1) patterns & conventions — shared utilities, React hooks, CSS conventions; (2) error handling — proper API responses, loading/error states, no silent failures; (3) performance — unnecessary re-renders, duplicate API calls; (4) maintainability — no magic numbers, no duplicated logic; (5) **state/timing/race** (required for DB/cache/shared-state mutations) — stale useMemo after setter, re-entrancy, effect re-fire, cache invalidation, query invalidation, override confirmation, safety timers, chunk-boundary; (6) **refactor/extraction** (required if diff moves code) — blind-diff against original, dropped imports (Biome `noUndeclaredVariables` is OFF so build won't catch), dedupe completeness across all projects, public API preserved.

Output: `## Code Quality: PASS / ISSUES FOUND` table.

**Agent C — Security & Auth Reviewer**

Checks: (1) auth coverage — auth guard on every new endpoint, RBAC, no raw auth-header reads (use helper functions); (2) input validation — parameterized SQL, `escapeHtml()` for HTML output; (3) secrets & CORS — no hardcoded secrets, CORS from shared utilities, no internal detail leaks in error responses.

Output: `## Security Review: PASS / ISSUES FOUND` table.

> For a full-surface security pass before merging (attacker profiles, cross-project parity, diff-ladder grepping), use `/pre-merge-review` in addition to this skill.

### Phase 3: Synthesize and Act

After all three reviewers (A, B, C) report:

1. **All PASS** → Report clean review, proceed to Phase 4 or commit
2. **MINOR issues only** → List them, ask user if they want to fix or skip
3. **IMPORTANT issues** → Fix them, then re-run the affected reviewer
4. **CRITICAL issues** → Fix immediately, re-run all three reviewers

### Phase 4: Visual Verification (if UI changed)

Skip if changes are backend-only or config-only. Requires changes deployed to
dev first (build + deploy). If not yet deployed, skip and add "deploy + visual
verify" to Next Steps.

Two steps — the deterministic runner FIRST (it catches render-crash-behind-200,
dead buttons, and silent data drops without an agent), then a judgment agent for
the subjective design checks the runner can't score.

**Step 4.1 — Run the e2e smoke/verify runner (deterministic, no agent)**

Run the e2e-verify runner against the deployed dev URL, scoped to the changed
views. This is the single-project deep check from the testing system (shell +
console baseline, dead-button sweep, DOM-vs-API data-truth diff, screenshots):

```bash
# Scope --views to the views your diff touched (comma-separated view ids from
# the project's manifests/<project>.targets.json). Omit --views to sweep all.
npx dotenvx run -- node .claude/skills/e2e-verify/e2e-verify.mjs <project> --views=<changed-views>
```

- Exit 0 = no CRIT/HIGH. Exit 1 = CRIT/HIGH present (or setup failed). Read the
  printed table + `.claude/reviews/e2e-<project>/findings.json`.
- **If the diff added a new view, a new data table, or a new destructive control**:
  update the e2e manifest in the SAME review — add the view, add a `dataCheck` for
  any new data table (confirm `domRowSelector` against the live DOM first — a wrong
  selector yields a false "silent drop" HIGH), and extend `skipButtons` for any new
  mutating/destructive button label. A view the manifest doesn't list is a view
  the testing system can't catch.
- The runner's data-truth diff is coarse (row-count presence). VALUE-level
  correctness (a wrong status, a miscomputed total) belongs in a Vitest unit test
  on the transform — add/extend one rather than relying on the DOM diff.

**Step 4.2 — Dispatch the design-judgment agent (model: "opus")**

The runner confirms the page works and the data isn't dropped; it does NOT judge
design fidelity. Dispatch Agent D (full prompt in [references/review-checklists.md](references/review-checklists.md)) to read the screenshots the e2e runner already wrote and assess: color tokens/dark theme, spacing/layout, component reuse, acceptance criteria from the plan.

Output: `## Design & Acceptance Judgment: PASS / ISSUES FOUND` table.

Note: For a broad multi-view health pass (not just the changed views), use
`/qa-sweep` instead — it fans this intent across every view with parallel agents.

### Phase 4b: Consumer Contract Verification (if data shape changed)

Skip if changes don't affect API response shapes or data transformations.

Dispatch Agent E (full prompt in [references/review-checklists.md](references/review-checklists.md)). It greps all frontend `.jsx` files that call modified endpoints, extracts every field path read (direct access, destructuring, map/filter callbacks, conditional checks), and verifies each consumer field exists in the API response with matching name and compatible type.

Output: `## Consumer Contract: PASS / MISMATCHES FOUND` table.

### Phase 4c: Mutation Endpoint Audit (if feature involves toggles/modes)

Skip if changes don't introduce alternative code paths or feature toggles.

Dispatch Agent F (full prompt in [references/review-checklists.md](references/review-checklists.md)). It identifies the toggle mechanism, greps all API handler files across all projects for POST/PUT/DELETE handlers and external API calls, and checks each for toggle awareness or a 501 fallback.

Output: `## Mutation Audit: PASS / UNPROTECTED ENDPOINTS` table.

### Phase 4d: Write Cycle Test (if feature involves mutations)

Skip if changes are read-only.

Dispatch Agent G (full prompt in [references/review-checklists.md](references/review-checklists.md)). It traces each write operation through the full cycle: write endpoint → cache invalidation → frontend refresh → UI state update. Tests with curl: POST the write, GET the read endpoint, verify data appears.

Output: `## Write Cycle: PASS / ISSUES FOUND` table.

### Phase 5: Report

Present a concise summary:

```markdown
## Implementation Review: [Feature]

### Grade: [A/B/C/F] (weighted score: X.X/5.0)
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Functionality | X/5 | 40% | X.X |
| Design consistency | X/5 | 25% | X.X |
| Data integrity | X/5 | 20% | X.X |
| Performance | X/5 | 15% | X.X |

**Spec Compliance:** PASS / X issues (Y fixed)
**Code Quality:** PASS / X issues (Y fixed)
**Security:** PASS / X issues (Y fixed)
**Visual:** e2e-verify PASS/FAIL (X CRIT/HIGH) + design judgment PASS / X issues (deployed: yes/no)
**Consumer Contracts:** PASS / X mismatches (if data shape changed)
**Mutation Audit:** PASS / X unprotected (if toggles/modes involved)
**Write Cycle:** PASS / X issues (if mutations involved)

### Issues Found & Resolved
- [brief description of what was caught and fixed]

### Ready to Commit: YES / NO (pending fixes)
```

## Review Anti-Patterns (Do NOT do these)

- **Rubber-stamping**: "Looks good" without reading the code → always cite specific files
- **Style-only feedback**: Focusing on formatting when there are logic bugs
- **Trusting the implementer's self-report**: Always read the diff independently
- **Scope creep in review**: Suggesting refactors or features not in the spec
- **Blocking on MINOR**: Don't hold up a commit for naming preferences

## Integration with Other Skills

| Workflow | When to Review |
|----------|---------------|
| `/write-plan` → implement → `/review-impl` | Standard feature workflow |
| `/research-gate` → implement → `/review-impl` | Simpler features |
| Bug fix → `/review-impl` | Only if fix touches 3+ files |
| `/deploy` | Review runs automatically before deploy if changes are uncommitted |
| `/pre-merge-review` | Full-surface pre-merge: diff-ladder, attacker profiles, cross-project parity, SQL/migration discipline — run before merging to main |
