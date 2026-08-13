---
name: persistent-issue
description: "Escalating diagnostic router for persistent issues. Classifies, dispatches Team A-E, auto-escalates in cascade mode. Triggers: 'not fixed', 'still broken', 'same error'."
---

# Persistent Issue — Diagnostic Escalation Router

Triggers when a fix attempt fails and the user reports the issue persists. Classifies the issue, dispatches the right diagnostic team, and optionally auto-escalates through all teams.

## Arguments

- `--cascade`: Auto-escalate through all diagnostic teams without stopping (default: stop after each team and report)
- First argument (optional): Issue description or "same" to reference the current conversation

## Trigger Words

Activate PROACTIVELY when the user says: "not fixed", "still happening", "still broken", "same error", "tried that", "didn't work", "nope still there", "happening again"

## Phase 1: Triage (single agent, model: "opus")

Dispatch one triage agent to classify the issue:

**Agent: Issue Classifier**
1. Read conversation history for:
   - Original symptom description
   - Fix attempts made (code changes, deploys, config changes)
   - How the symptom changed (or didn't) after each attempt
2. Run `git log --oneline -15` for recent commits related to the area
3. Check memory/ for prior encounters with this issue
4. Classify into exactly ONE primary category:

| Category | Signal | Route To |
|----------|--------|----------|
| **A: Wrong Root Cause** | Fix applied, symptom persists identically | `/deep-root-cause` |
| **B: Wrong Layer** | Fix applied, behavior changed but still broken | `/full-stack-trace` |
| **C: Multiple Factors** | Fix partially works, or works inconsistently | `/isolation-test` |
| **D: Intermittent** | Issue comes and goes, seemed fixed then returned | `/temporal-forensics` |
| **E: Regression** | "This used to work" / broke after a recent change | `/regression-bisect` |

5. Build the **Evidence Document**:
```
## Persistent Issue: [title]
### Symptom
[exact description]
### Prior Attempts
1. [what was tried] -> [what happened]
2. [what was tried] -> [what happened]
### Classification: [A/B/C/D/E] — [reason]
### What We Know For Certain
- [verified fact 1]
- [verified fact 2]
### What We Assumed But Haven't Verified
- [assumption 1]
- [assumption 2]
```

## Phase 2: Dispatch

Present the Evidence Document and classification to the user.

**Default mode**: Report classification and invoke the appropriate diagnostic skill. Wait for user feedback after each team.

**Cascade mode** (`--cascade`): Invoke the classified skill first. If it doesn't resolve the issue (agent reports "no root cause found" or fix doesn't work), automatically escalate to the next team in order: A -> B -> D -> C -> E. Skip the team already tried. Continue until resolved or all teams exhausted.

### Escalation Order (cascade mode)
1. Start with classified team
2. If unresolved -> try next in priority: A -> B -> D -> C -> E
3. Between each team, update the Evidence Document with new findings
4. Pass the accumulated Evidence Document to each subsequent team
5. Max 3 teams per cascade (context budget protection)

## Phase 3: Resolution

After the diagnostic team identifies the root cause:
1. Present the finding with specific file:line references
2. Propose the fix
3. If `--cascade`, implement the fix and verify
4. Update the Evidence Document with the resolution
5. If fix works: done. If not: escalate to next team (cascade) or report back (default)

## Anti-Patterns
- NEVER re-try the same approach that already failed — the Evidence Document tracks prior attempts
- NEVER skip triage — even if you think you know the category, verify against evidence
- NEVER diagnose AND fix in the same agent — separate concerns (Pattern 2 from /cascade-orchestration)
- If all 3 cascade teams fail, STOP and present findings to user — don't loop

## Integration
- Reads from: `/debug-collaborate` findings (if previously run)
- Feeds into: project-specific troubleshooting skill (add new patterns discovered)
- Updates: memory/ with persistent issue patterns for future sessions
