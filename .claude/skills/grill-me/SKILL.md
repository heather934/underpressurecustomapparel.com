---
name: grill-me
description: "Interrogate the user about their idea before any work begins. Works the design tree in rounds - asks the whole unblocked frontier at once with a recommended answer each, self-serves facts from the codebase. Produces an Intent Summary for /research-gate."
---

# Grill Me — Intent Interrogation

Interview the user relentlessly until you reach a shared understanding of what they want built. Prevents building the wrong thing.

Map the idea as a **design tree**: every decision branches into the decisions that hang off it.

## When to Use

- User describes a new feature concept with ambiguous scope
- User references a business process Claude hasn't encountered before
- Cross-department stakeholders involved
- User explicitly invokes `/grill-me`
- Any request where "what" or "why" is unclear, even if "how" seems obvious

## When to Skip

- Bug fixes or "X is broken" — go straight to diagnosis
- User provides a detailed spec or plan document
- Feature is a direct copy of an existing view (use `/propagate-feature`)
- Single-file changes or config updates
- User says "just do it" or "I know what I want"

## Rounds and the Frontier

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask *now* without guessing at answers you haven't heard yet.

**Ask the whole frontier in one round.** Then wait for the user's answers before the next round.

Each answer reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in *this* round belongs to a *later* round.

Round one is often a single critical question — the one that opens everything else. That is correct, not a failure to batch.

The session is done when the frontier is empty: every branch visited, nothing silently assumed.

**Why rounds, not one-at-a-time:** the tail of a grilling session is mostly easy questions. One-per-turn turns that tail into "yes, yes, yes" across ten round-trips — the user's attention is spent on ceremony instead of on the decisions that matter. Batching the frontier lets them blast through the easy ones (dictation works well here) and spend their thinking on the hard ones.

### Question format

Default to numbered markdown so the user can answer against the numbers:

```
### Round 1

❓ **Q1 — <question title>**: <question body, multiple paragraphs and options allowed>

➡️ <your recommended answer, and why>

❓ **Q2 — <question title>**: ...

➡️ ...
```

If your harness offers a structured multiple-choice prompt, use it **only when the whole round is closed-choice** — every question has a small set of discrete options. Open-ended questions ("paint the picture", "what breaks today") lose their value squeezed into fixed options, so those rounds stay markdown.

### Facts are your job, decisions are theirs

Finding *facts* is never the user's job. When a frontier question needs a fact from the environment — a schema, an existing endpoint, who holds a permission, what a column actually contains — go get it. Grep, query, read the notes. Then tell the user what you found and ask only whether it's right.

Don't block on it. A running lookup is an unsettled prerequisite: only the questions downstream of it wait. Ask the rest of the frontier now. If the harness supports it, dispatch a sub-agent for the lookup and keep interviewing.

The **decisions** are the user's. Put each to them and wait.

## Project Glossary

If your project maintains a domain glossary (a file that pins down what overloaded terms mean — shared identifiers, record types, process names, status codes, etc.), read it before the first question. Grilling on a codebase fails when the agent re-learns jargon every session or quietly conflates two meanings of one word.

During the session:

- **Challenge fuzzy language against the glossary.** If the user says a term the glossary defines, confirm you're both using it the same way. If they describe a concept verbosely and a glossary term already covers it, say so.
- **Sharpen new terms.** When the feature introduces a term not in the glossary — or uses an existing term in a new way — that's a grilling branch: get a one-line definition the user agrees on. Surface collisions explicitly (does this new "X" mean the same as the existing "X"?).
- **Cross-reference code.** Verify a proposed term against how the codebase actually names the concept (a grep often settles it faster than a question).
- **Update the glossary as you go.** When the session lands a sharpened or new definition, add/update the entry in the same commit as the feature — undocumented shared language is the gap this skill exists to close.

This glossary pass is optional for non-codebase use (writing, planning, personal decisions), but mandatory for any feature touching a repo that maintains one.

## The Design Tree

These are the branches, not a walk order. Each round, ask whichever are on the frontier; skip any the context already answers:

### 1. Audience & Access
- Who uses this? Which user roles? Which project/app?
- Is this for a specific person or team?
- Does it need specific permissions or is it for all authenticated users?

### 2. Success Criteria
- What does "working" look like? Paint the picture.
- How will you know it's done? What's the minimum viable version?
- Is there an existing process this replaces? (spreadsheet, phone call, email, manual workflow)

### 3. Data Source & Shape
- Where does the data come from? (internal database, external API, cache, manual entry)
- How fresh does it need to be? (real-time, cached, daily, weekly)
- What are the key fields? What's the primary identifier?
- Are there edge cases in the data? (duplicates, nulls, cancelled records, zero-quantity lines)

### 4. Interaction Model
- Is this a dashboard (view-only), a tool (input/output), or a workflow (multi-step)?
- Daily use or occasional? (determines caching strategy and data density)
- Mobile or desktop? (determines responsive strategy)
- Does it need to send notifications, emails, or trigger actions?

### 5. Integration Points
- Does this connect to existing views/features? Which ones?
- Does it need a new API endpoint, or can it reuse existing ones?
- Does it need new database tables, cache keys, or external service columns?
- Does it interact with external systems?

### 6. Edge Cases & Risks
- What happens when there's no data? (empty state)
- What happens with bad/incomplete data? (error handling)
- Who should NOT see this? (security implications)
- What's the blast radius if it breaks? (read-only = low, mutations = high)

### 7. Priority & Scope
- How urgent is this? (blocking production, improving workflow, nice-to-have)
- Is this the full vision or an MVP? What gets cut for v1?
- What does v2 look like? (helps design for extensibility without over-engineering)

Branches 1-4 are the load-bearing ones. Branches 5-7 can be resolved by `/research-gate` or during implementation if the user is out of patience.

## Termination

Stop when the frontier is empty, or when branches 1-4 are settled and the user wants to move.

Produce an **Intent Summary**:

```markdown
## Intent Summary: [Feature Name]

**For**: [audience] in [project]
**Purpose**: [one sentence — what problem this solves]
**Replaces**: [current process, if any]
**Data**: [source] → [key fields] → [display format]
**Interaction**: [dashboard/tool/workflow], [frequency], [device]
**Success**: [what "done" looks like — 2-3 bullet points]
**MVP scope**: [what's in v1, what's deferred]
**Risks**: [key edge cases or unknowns]
```

Do not act on it until the user confirms you have reached a shared understanding. The summary is the input to `/research-gate` Phase 1 — paste it directly into the feature description.

Before producing the summary, confirm any glossary additions or edits the session produced are written — the Intent Summary should use the glossary's terms verbatim.

## Integration

| Skill | Relationship |
|-------|-------------|
| `/research-gate` | **Feeds into** — Intent Summary is the input |
| `/write-plan` | **Upstream** — Intent Summary referenced in plan Goal |
| `/full-stack-build` | **Upstream** — can invoke grill-me in Phase 0 if intent is unclear |
| `/persistent-issue` | **Not related** — grill-me is for new features, not debugging |

When a branch of the tree can only be answered by someone who isn't the user — a stakeholder, a domain expert, a customer — export that branch into a document for them rather than guessing or stalling the whole session on it.

## Pipeline Position

```
/grill-me  →  /research-gate  →  /write-plan  →  /full-stack-build
  INTENT        CONSTRAINTS       DECOMPOSITION     EXECUTION
```

---

*The rounds/frontier model is adapted from the `grilling` skill in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).*
