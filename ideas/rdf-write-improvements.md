# Idea: Improvements to `rdf_write` and Its Skill

A set of targeted improvements to the existing RDF write tool and skill.

---

## 1. Append Mode

**Problem**: `rdf_write` always overwrites the target file. Adding a few
triples to a large existing file requires reading the whole file, concatenating
the new Turtle manually, and writing everything back — risking blank-node
corruption and prefix collisions.

**Fix**: add a boolean `append` parameter. When `true`:
1. Parse the existing file (if it exists).
2. Parse the new Turtle.
3. Union the quad sets (deduplicate exact duplicates).
4. Merge prefix maps.
5. Serialise and write.

---

## 2. Prefix Registry / Snippet Injection in Skill

**Problem**: the skill lists common prefixes as a static Markdown block.
The agent has to copy them manually and sometimes omits or misspells them.

**Fix**: define a machine-readable prefix registry (a JSON file shipped with
the skill) mapping prefix aliases to IRIs. The skill instructs the agent to
reference this registry when composing Turtle, guaranteeing correct IRIs for
all well-known vocabularies (FOAF, Schema.org, Dublin Core, PROV-O, DCAT,
VOID, SHACL, GEO, QB, etc.).

Alternatively, build a small `rdf_prefixes(aliases[])` helper tool that
returns the correct PREFIX declarations for the requested aliases — zero
lookup cost for the agent.

---

## 3. Round-trip Fidelity Warning

**Problem**: serialising through n3's `Writer` normalises Turtle in ways that
can lose author intent (reordering triples, collapsing blank nodes, changing
literal quoting). Users who care about diff-stable output are surprised.

**Fix**: after writing, compute a hash of the input quad set and the output
quad set. If they differ (e.g. quads were dropped — which can happen with
certain blank-node topologies), log a warning in the tool result.

Also document in the skill: "the output is semantically equivalent but not
textually identical to your input."

---

## 4. Turtle Formatting Options

**Problem**: n3's Writer produces compact but sometimes hard-to-read output
(especially with long chains of semicolons). Power users may want sorted
subjects, specific indentation, or grouped predicates.

**Fix**: add a `style` parameter:
- `"compact"` (current default): minimal whitespace, grouped with `;`/`,`.
- `"expanded"`: one triple per line, no grouping.
- `"sorted"`: subjects sorted alphabetically, predicates sorted within each
  subject.

---

## 5. Blank-Node Skolemisation Option

**Problem**: blank nodes written by `rdf_write` have opaque labels (`_:b0`,
`_:b1`, …) that change on every serialisation. This breaks diff tools and
makes incremental updates fragile.

**Fix**: add a `skolemise` boolean (default `false`). When `true`, replace
all blank nodes with IRIs of the form `<{baseUri}/.well-known/genid/{uuid}>`,
where `baseUri` is a parameter. This makes every node addressable and
diff-stable.

---

## 6. Dry-Run / Preview Mode

**Problem**: there is no way to validate Turtle and see the triple count
*without* writing to disk. Useful when the agent is unsure of the output
and wants to check before committing.

**Fix**: add a `dryRun` boolean. When `true`, parse and serialise but do not
write. Return the same summary (triple count, format, first 20 triples as a
preview) without touching the filesystem.
