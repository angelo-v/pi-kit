# @aveltens/pi-kit-software-development

Pi Coding Agent skills and extensions for software development workflows.

## Features

### ADR — Architecture Decision Records

Create [MADR-format](https://adr.github.io/madr/) Architecture Decision Records interactively.

**Skill:** `adr` — loaded automatically when you ask pi to create an ADR.

**Tool:** `create_adr` — interactive wizard that:
1. Asks where to store ADRs (once per session), offering common locations like `docs/decisions`, `docs/adr`, or a custom path
2. Interviews you step-by-step through the MADR template
3. Writes a numbered `NNNN-short-title.md` file

#### Example prompts

```
Create an ADR for our decision to use PostgreSQL as the primary database
Document the decision to adopt a monorepo structure
Record the ADR for switching from REST to GraphQL
```

#### MADR sections covered

- **Title** — short noun phrase
- **Status** — `proposed` | `accepted` | `deprecated` | `superseded`
- **Context and Problem Statement**
- **Decision Drivers** — forces, constraints, quality goals
- **Considered Options**
- **Decision Outcome** — chosen option + reason
- **Pros and Cons of the Options** — trade-off scaffold per option

## Installation

```bash
pi install ./packages/software-development
```

Or add to your project's `.pi/settings.json`:

```json
{
  "packages": ["./packages/software-development"]
}
```
