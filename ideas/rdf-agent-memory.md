# RDF-Based Agent Memory

## Core Idea

The agent accumulates all RDF triples it encounters into a local N-Quads file. This
becomes a personal knowledge graph that grows organically across sessions. On recall,
the agent queries it locally first via an in-process Oxigraph store, then decides
whether to re-fetch the original source for fresher data.

The memory file is not a prose store or a wrapper around natural language facts. RDF
triples are the facts. The file is also an entry point: URIs in the graph lead to
authoritative sources the agent can dereference on demand.

---

## Storage

**`~/.pi/agent/memory.nq`** — N-Quads, one quad per line.

N-Quads over Turtle because the 4th column (named graph) is the source URI, giving
provenance for free:

```nquads
<https://you/profile#me> <http://xmlns.com/foaf/0.1/name> "Your Name" <https://you/profile> .
<https://you/profile#me> <http://xmlns.com/foaf/0.1/knows> <https://alice/profile#me> <https://you/profile> .
```

Every triple knows:
- where it came from
- which triples to invalidate when re-fetching a source
- which sources have already been visited

Locally asserted facts (no authoritative URI) go in a dedicated named graph:

```nquads
<https://you/profile#me> <http://xmlns.com/foaf/0.1/name> "Your Name" <urn:pi:agent:local> .
```

---

## Session Lifecycle

```
session_start
  └─► load memory.nq into in-process Oxigraph store
  └─► inject seed facts (WebID, name, high-salience triples) as plain text into system prompt

[agent works, queries and fetches as needed]

session_end
  └─► flush Oxigraph store back to memory.nq
```

---

## Agent Loop on Recall

```
need a fact
    │
    ├─► SPARQL query local Oxigraph
    │       │
    │       ├─► found, fresh enough ──► use it
    │       │
    │       └─► not found / stale
    │                   │
    │                   └─► memory_fetch URI
    │                               │
    │                               ├─► dereference URI
    │                               ├─► parse RDF response
    │                               ├─► store all quads in named graph <URI>
    │                               └─► re-query Oxigraph
    │
    └─► answer from local graph
```

---

## RDF-star: Relevance and Age on Facts

RDF-star annotates triples directly, without reification or wrapper nodes. Oxigraph
supports RDF-star natively. Storage uses N-Quads-star, one annotation per line.

```
<< <https://you/profile#me> <foaf:workplaceHomepage> <https://example.org> >>
    <mem:relevance>        "0.8"^^xsd:decimal         <urn:pi:agent:local> .
<< <https://you/profile#me> <foaf:workplaceHomepage> <https://example.org> >>
    <prov:generatedAtTime> "2026-05-14T10:00:00Z"^^xsd:dateTime <urn:pi:agent:local> .
<< <https://you/profile#me> <foaf:workplaceHomepage> <https://example.org> >>
    <mem:lastConfirmedAt>  "2026-06-01T09:00:00Z"^^xsd:dateTime <urn:pi:agent:local> .
<< <https://you/profile#me> <foaf:workplaceHomepage> <https://example.org> >>
    <mem:lastUsedAt>       "2026-06-10T08:00:00Z"^^xsd:dateTime <urn:pi:agent:local> .
```

### Timestamps

| Annotation | Meaning |
|---|---|
| `prov:generatedAtTime` | when the triple was first asserted |
| `mem:lastConfirmedAt` | when it was last seen to still be true (re-fetch or user confirmation) |
| `mem:lastUsedAt` | when the agent last retrieved and used it |

Age of assertion tells you how stale a fact might be. Age of last confirmation tells
you how recently it was verified. Together they drive the re-fetch decision.

### Relevance

Starts neutral at 0.5 when a fact is first stored. Adjusted by user feedback:

```
user confirms / uses result positively  →  relevance + delta
user corrects / ignores                 →  relevance - delta
time passing without use                →  relevance * decay factor
```

SPARQL-star queries relevance directly:

```sparql
SELECT ?s ?p ?o ?relevance WHERE {
    << ?s ?p ?o >> mem:relevance ?relevance .
    FILTER(?relevance > 0.7)
}
ORDER BY DESC(?relevance)
```

### Re-assertion Decision

```
fact is old AND last confirmed long ago AND relevance dropping  →  re-fetch or invalidate
fact is old BUT confirmed recently                             →  trust it
fact is new BUT never confirmed                                →  low confidence, candidate for verification
```

### Context Injection Ranked by Relevance

At session_start, instead of injecting arbitrary facts, inject the top-N by relevance
for the current context. Facts that have proven useful rise to the top. Facts the user
never validated slowly fade below the injection threshold.

---

## Tools

### `memory_query`
SPARQL SELECT/CONSTRUCT against the local Oxigraph store.
Fast, offline, no network.

### `memory_fetch`
Dereference a URI, parse the RDF response (Turtle, JSON-LD, RDF/XML),
store all triples as quads in named graph `<URI>`, return matching results.
This is how the graph grows.

### `memory_invalidate`
Drop all quads in a named graph `<URI>` to force a re-fetch on next access.
Used when the agent knows a source has changed.

### `memory_assert`
Add triples to the local named graph `<urn:pi:agent:local>`, with initial RDF-star
annotations: `prov:generatedAtTime` (now), `mem:relevance` (0.5), `mem:lastConfirmedAt`
(now). For facts that have no authoritative URI — user preferences, agent observations,
cross-session decisions.

### `memory_retract`
Remove specific triples and all their RDF-star annotations from the local named graph.
For facts that are no longer true.

### `memory_feedback`
Adjust `mem:relevance` on a specific triple up or down based on user feedback. Also
updates `mem:lastUsedAt`. Called by the agent after a retrieval when the user's
response signals whether the fact was useful or wrong.

---

## Context Injection

At session start, the full graph is not dumped into context. Instead:

- A small set of high-salience triples is rendered as plain text and injected into
  the system prompt (WebID, name, active project, key preferences).
- The rest is available on demand via `memory_query`.

If the graph is small enough to fit in context entirely, it can be serialised as
Turtle or plain text and injected wholesale. Graduate to selective loading when the
file actually grows.

---

## The Memory File as Entry Point

URIs in the graph are links to authoritative sources. The local file stays minimal —
just seed triples and facts with no better home. Everything with a URI gets fetched
when needed:

```
memory.nq
  └─► WebID URI ──────────────────► your profile doc (authoritative)
  └─► project URI ────────────────► project RDF metadata
  └─► foaf:knows ─────────────────► colleagues' profiles
  └─► doap:Project ───────────────► software descriptions
  └─► schema:Organization ────────► org/team data
```

The graph is the web of data itself. The local file is the bookmark into it.

---

## What to Build

1. `~/.pi/agent/memory.nq` — seed file with WebID and starter triples
2. `~/.pi/agent/extensions/memory/index.ts` — extension entry point
   - `session_start` → load memory.nq into Oxigraph, inject seed facts into context
   - `session_end` → flush Oxigraph back to memory.nq
3. `~/.pi/agent/extensions/memory/tools.ts` — tool definitions
   - `memory_query`, `memory_fetch`, `memory_invalidate`, `memory_assert`, `memory_retract`, `memory_feedback`
4. `~/.pi/agent/skills/memory/SKILL.md` — agent instructions
   - when to store triples vs. when to re-fetch
   - how to model facts using standard vocabularies (foaf, schema, dct, prov, doap)
   - prefer reusing existing URIs and predicates over inventing new ones
   - use `<urn:pi:agent:local>` only for facts with no authoritative source

---

## Key Properties

- **No prose blobs** — triples are the facts, not strings describing facts
- **Standard vocabularies** — foaf, schema, dct, prov, doap; custom terms only when necessary
- **Provenance built-in** — named graph = source URI
- **Statement-level metadata** — RDF-star for relevance and timestamps directly on triples
- **Relevance ranking** — user feedback drives what surfaces at session start
- **Age-aware** — three timestamps per fact drive re-assertion decisions
- **Cache invalidation** — drop named graph, re-fetch
- **Offline-first** — Oxigraph query before any network call
- **Hand-editable** — plain N-Quads-star file, no database, git-friendly
- **Grows organically** — agent adds triples as it encounters RDF on the web
