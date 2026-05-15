---
name: adr
description: Creates Architecture Decision Records (ADRs) in MADR format (https://adr.github.io/madr/). Use when the user wants to document an architectural decision, create a new ADR, or record a technical choice with its context, options, and rationale. Interviews the user interactively using the questionnaire tool.
---

# Architecture Decision Records (MADR)

This skill creates ADRs following the [MADR format](https://adr.github.io/madr/).

## Workflow

Follow these steps exactly, in order.

### Step 1 — Find the ADR directory

Call `detect_adr_dir` to check whether an ADR directory already exists in the project.

Then use `questionnaire` to ask the user where to store ADRs:

```
questions:
  - id: adr_dir
    label: Location
    prompt: "Where should ADRs be stored?"
    options:
      <one option per directory returned by detect_adr_dir, using the path as both value and label>
      - value: custom
        label: "Custom path…"
        description: "Enter your own directory path"
    allowOther: true
```

If the user selects "Custom path…" or types a custom value, use that path as-is.

### Step 2 — Collect the ADR content

Call `questionnaire` with the following questions to gather all required information.

For questions that require free-text answers, set `allowOther: true` and provide representative example options to guide the user — they can type their own answer instead.

```
questions:
  - id: title
    label: Title
    prompt: "Short title for this decision (noun phrase)"
    options:
      - value: custom
        label: "Type a title…"
    allowOther: true

  - id: status
    label: Status
    prompt: "What is the status of this decision?"
    options:
      - value: proposed
        label: proposed
        description: "Not yet decided"
      - value: accepted
        label: accepted
        description: "Agreed and in effect"
      - value: deprecated
        label: deprecated
        description: "No longer recommended"
      - value: superseded
        label: superseded
        description: "Replaced by another ADR"
    allowOther: false

  - id: context
    label: Context
    prompt: "Describe the context and problem. What is the issue that motivates this decision?"
    options:
      - value: custom
        label: "Describe the context…"
    allowOther: true

  - id: drivers
    label: Drivers
    prompt: "What are the key decision drivers? (forces, constraints, quality goals — comma-separated or one per answer)"
    options:
      - value: custom
        label: "List decision drivers…"
    allowOther: true

  - id: options
    label: Options
    prompt: "What options were considered? (list them separated by commas or semicolons)"
    options:
      - value: custom
        label: "List considered options…"
    allowOther: true

  - id: chosen_option
    label: Decision
    prompt: "Which option was chosen?"
    options:
      - value: custom
        label: "State the chosen option…"
    allowOther: true

  - id: outcome_reason
    label: Reason
    prompt: "Why was this option chosen? (completes: 'because …')"
    options:
      - value: custom
        label: "Explain the reason…"
    allowOther: true

  - id: good_consequences
    label: Pros
    prompt: "What are the positive consequences? (completes: 'Good, because …')"
    options:
      - value: custom
        label: "Describe positive consequences…"
    allowOther: true

  - id: bad_consequences
    label: Cons
    prompt: "What are the negative consequences or trade-offs? (completes: 'Bad, because …')"
    options:
      - value: custom
        label: "Describe negative consequences…"
    allowOther: true
```

### Step 3 — Parse list answers

The `drivers` and `options` answers may be comma- or semicolon-separated strings. Split them into proper arrays before passing to `create_adr`.

### Step 4 — Write the ADR

Call `create_adr` with all collected answers:

- `adr_dir` — from Step 1
- `title` — from the title answer
- `status` — from the status answer
- `context` — from the context answer
- `drivers` — string array (split from drivers answer)
- `options` — string array (split from options answer)
- `chosen_option` — from the chosen_option answer
- `outcome_reason` — from the outcome_reason answer
- `good_consequences` — from the good_consequences answer
- `bad_consequences` — from the bad_consequences answer

### Step 5 — Confirm

Tell the user the file was created, show the path, and offer to open or review it.

## MADR Naming Convention

Files follow the pattern `NNNN-short-title.md` (zero-padded sequence number). The `create_adr` tool handles numbering automatically.

## Tips

- One ADR per decision. Keep them small and focused.
- Accepted ADRs should never be deleted — only superseded.
- Link related ADRs using relative Markdown links.
