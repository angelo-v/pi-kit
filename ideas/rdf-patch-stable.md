# Idea: Format-Preserving RDF Patching (`rdf_patch` That Keeps File Text Intact)

## Problem

`rdf_patch` (see [rdf-diff-patch.md](rdf-diff-patch.md)) and `rdf_write` both
update RDF files via a **full parse → update → re-serialize cycle**. The
unchanged 95% of the file is rewritten from scratch:

- Comments, blank lines, indentation and syntactic style (`;` groupings,
  abbreviations) are lost.
- Triple **order** is not stable — the N3 `Store` and Oxigraph emit quads in
  hash-index order, so a patch shuffles the whole file's layout.
- Every edit produces a maximal git diff, making reviews of ontology/data files
  noisy and error-prone.

The question that motivated this investigation: **how does the Community Solid
Server (CSS) apply N3 Patch / SPARQL PATCH to Turtle resources, and does it
preserve the original file's formatting/order?** The short answer: **it does
not — nobody does.** Details and sources below.

## Investigation 1 — Community Solid Server (CSS)

Repo: [CommunitySolidServer/CommunitySolidServer](https://github.com/CommunitySolidServer/CommunitySolidServer)
(inspected at v7.2.0). All paths link to `blob/HEAD/…`.

### PATCH pipeline (graph-level, not text-level)

The flow for `PATCH` on a `text/turtle` resource is:

1. **HTTP layer** —
   [`src/http/ldp/PatchOperationHandler.ts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/ldp/PatchOperationHandler.ts)
   checks the content type and calls `store.modifyResource(target, body, conditions)`.
   The body is parsed by
   [`src/http/input/body/N3PatchBodyParser.ts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/input/body/N3PatchBodyParser.ts)
   (`text/n3` only): it parses the patch with the N3 parser, extracts
   `?patch rdf:type solid:InsertDeletePatch` plus its `solid:deletes` /
   `solid:inserts` / `solid:where` formulae into `Quad[]` arrays
   ([`src/http/representation/N3Patch.ts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/representation/N3Patch.ts)).
   Note: the parser keeps the raw patch text in `patch.data`, but that text is
   **never used downstream** — only the parsed quads are.
2. **Store chain** — `LockingResourceStore` → **`PatchingStore`**
   ([`src/storage/PatchingStore.ts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/PatchingStore.ts)):
   since `DataAccessorBasedStore.modifyResource` throws
   `NotImplementedHttpError`, it falls through to the configured
   `RepresentationPatchHandler` → `RepresentationConvertingStore` →
   `DataAccessorBasedStore` → `FileDataAccessor`.
3. **Patch handlers** — `RepresentationPatchHandler` fetches the *existing*
   representation, runs the patcher, then **writes the whole result back** via
   `source.setRepresentation(identifier, patched)`. The
   [`ConvertingPatcher`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/ConvertingPatcher.ts)
   uses `intermediateType: "internal/quads"`, `defaultType: "text/turtle"` —
   i.e. converts the document to quads, patches, converts quads *back* to the
   original content type.
4. **Patchers** — [`RdfPatcher`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/RdfPatcher.ts)
   drains the quad stream into an **N3 `Store`**, runs the inner patcher, and
   returns the store as a stream via `patchedRepresentation.dataset.match()`.
   The waterfall below it: `ImmutableMetadataPatcher` (protects
   `ldp:contains`, `posix:size`, …) → **`N3Patcher`**
   ([solves the `?where` BGP bindings, removes `?deletes` quads, adds
   `?inserts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/N3Patcher.ts))
   or **`SparqlUpdatePatcher`**
   ([runs DELETE/INSERT through Comunica against the same N3 Store](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/SparqlUpdatePatcher.ts)).

**Everything happens at the RDF-graph level.**

### How the patched file is written back — the smoking gun

[`QuadToRdfConverter`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/conversion/QuadToRdfConverter.ts)
is the single point where the new Turtle text is generated:

```ts
if (/(?:turtle|trig)$/u.test(contentType)) {
  const prefixes = Object.fromEntries(quads.metadata.quads(null, PREFERRED_PREFIX_TERM, null)
    .map(({ subject, object }): [string, string] => [ object.value, subject.value ]));
  const options = { format: contentType, baseIRI: identifier.path, prefixes };
  data = pipeSafely(quads.data, new StreamWriter(options));
} else {
  data = rdfSerializer.serialize(quads.data, { contentType }) as Readable;
}
```

That is a plain **N3 `StreamWriter` re-serialization** of the quads. Grep of
`src/` confirms there is **no text-level / positional patching logic
anywhere** — no string splicing, no `n3.Writer` with source anchors.

The parse side,
[`RdfToQuadConverter`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/conversion/RdfToQuadConverter.ts),
has exactly one format-preserving trick: it captures `@prefix` mappings via
the parser's `prefix` event into metadata quads with `PREFERRED_PREFIX_TERM`,
which `QuadToRdfConverter` then re-emits. The code comment says this exists
for "the PATCH operation, which is the main case why we store the prefixes in
metadata here". **Prefixes survive the round-trip; everything else — comments,
whitespace, original triple ordering, syntactic style — is regenerated
canonically.**

Additional evidence that this is intentional:

- `RdfPatcher.ts` returns `dataset.match()` — N3's `Store.match()` iterates
  internal hash indexes, so output order is the store's internal order, **not**
  the original file's triple order.
- No CSS test asserts ordering or formatting preservation through a PATCH.
  [`test/unit/storage/conversion/QuadToRdfConverter.test.ts`](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/test/unit/storage/conversion/QuadToRdfConverter.test.ts)
  explicitly asserts *canonical* N3 output with sorted prefixes and
  base-IRI relativization.
- The official docs
  ([Patching](https://communitysolidserver.github.io/CommunitySolidServer/latest/architecture/features/protocol/patching/))
  describe the pipeline as "Convert the stored resource to a stream of quad
  objects … Apply the patch to the quad store … **Convert the quad stream back
  to the original media type of the resource**" — re-serialization is the
  documented, intended behaviour.

### History

N3 Patch support landed in **CSS v3.0.0** (2022-02-23), not v6/v7 as often
assumed: `CHANGELOG.md` — *"Feat: Add support for N3 Patch (a9941eb)"*. A
relevant later change: v7.2.0 relaxed blank-node restrictions in patching
(PR #1978).

### Spec note

The N3 *language* spec contains no patch grammar. The N3 Patch algorithm lives
in the [Solid Protocol spec §5.3.1](https://solidproject.org/TR/protocol#n3-patch),
whose algorithm ("the triples resulting from ?deletions are to be removed from
the RDF dataset … The combination of deletions followed by insertions then
forms the new resource state") is defined purely on the **RDF abstract
syntax / graph level** and mandates no text preservation whatsoever. `N3PatchBodyParser`
and `N3Patcher` implement these Solid requirements directly.

## Investigation 2 — JS RDF libraries: no format-preserving serializer exists

### rdflib.js

[linkeddata/rdflib.js](https://github.com/linkeddata/rdflib.js) has real patch
support — [`src/patch-parser.js`](https://github.com/linkeddata/rdflib.js/blob/main/src/patch-parser.js)
parses a SPARQL-Update subset (`WHERE {…} DELETE {…} INSERT {…}` / `INSERT DATA`)
into an internal patch object in the `http://www.w3.org/ns/pim/patch#` namespace;
[`src/store.ts` `doPatch()`](https://github.com/linkeddata/rdflib.js/blob/main/src/store.ts)
applies `{delete, insert, where}` patches to the in-memory store (failing with
`'Could not find to delete'` / `'Patch ambiguous. No patch done.'` on mismatch).
[`src/update-manager.ts`](https://github.com/linkeddata/rdflib.js/blob/main/src/update-manager.ts)
sends patches over HTTP/websockets. But it's all **statement-level, not
text-level**.

Its serializer **always re-sorts statements** before writing — no
order-preserving mode:

- `statementsToNTriples()`: `var sorted = sts.slice(); sorted.sort()`
- `statementsToN3()`: `sts.sort(SPO)` with `SPO = Util.heavyCompareSPO(x, y, kb, uriMap)`,
  and even a special-cased URI map so `rdf:type` statements sort to the top:
  `uriMap = {'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': 'aaa:00'}`.
- The `setFlags()` mechanism only toggles abbreviation/encoding behaviours —
  no flag preserves source order or formatting.

### n3.js

[rdfjs/N3.js](https://github.com/rdfjs/N3.js) `Writer` is a quad sink: input
arrives via `addQuad` / `quads(stream)` and output is regenerated from quads.
All constructor options (`lists`, `end`, `version`, `format`, `baseIRI`,
`writeBase`, `prefixes`) — **no option relates to ordering or formatting
preservation**. Prefixes are rewritten via `addPrefixes`, comments are dropped,
layout is regenerated. Format-destroying, confirmed.

### Others

- [graphy](https://github.com/blake-regalia/graphy.js): its Turtle writer is a
  stream `Writable` consuming quads with style options only (`prefixes`,
  `lists`, `indent`, `directives`) — no sorting, no format preservation.
- [@rdfjs/serializer-turtle](https://github.com/rdfjs-base/serializer-turtle):
  explicitly pretty-prints, sorting subjects with `termCompare`. Not
  format-preserving, actively re-orders.
- [@jeswr/pretty-turtle](https://github.com/jeswr/pretty-turtle): re-serializes
  from RDF/JS quads; its `ordered: true` option sorts prefixes, subjects,
  predicates and objects alphabetically "to ensure the same input always
  produces the same output" — **deliberately deterministic**, i.e. the opposite
  of preserving input order/formatting.

**Bottom line:** the closest thing to "order-stable" is *deterministic* output.
No JS library found preserves the original source formatting.

### Text-preserving Turtle edit tools: none found

Searches across npm and GitHub (`turtle diff`, `rdf diff language:javascript`,
`rdf patch SPARQL in:description`, `rdf-diff`, `turtle-diff`, `rdf-patch`,
`annotated-turtle`) found **no JavaScript library that performs text-preserving
(position-tracking) edits on Turtle files**:

- [`sandhawke/datapatch`](https://github.com/sandhawke/datapatch) — RDF
  diff/patch tools; graph-level.
- [`CHUCC-server`](https://github.com/arne-bdt/CHUCC-server) — versioned
  SPARQL server using RDF Patch + Kafka; graph-level, Java.
- [`rdf-canonize`](https://www.npmjs.com/package/rdf-canonize) — URDNA2015
  canonicalization for graph diffing, not text.
- [`rdf-delta`](https://github.com/afs/rdf-delta) — patch-serialization format
  for graph diffs; Java, not text-preserving.

## Conclusion: Best Standard-Tooling Approach

**If you need unchanged text intact, you must build it yourself.** The
ecosystem (CSS, rdflib.js, N3, graphy, rdfjs serializers) all operate purely at
the graph level; the Solid spec itself defines patching on the abstract syntax
only.

Two viable directions for `pi-kit`:

1. **Reframe the problem as a diff problem** (see [rdf-diff-patch.md](rdf-diff-patch.md)):
   parse old + new, compute a triple-level diff, and splice only the changed
   regions into the *original* Turtle text. This requires a parser that
   exposes token/line positions — N3.js does not expose them publicly today.
2. **Accept re-serialization but make it deterministic** so repeated edits
   produce *minimal* diffs *after the first* edit: sort prefixes and subjects
   on every write (as `@jeswr/pretty-turtle`'s `ordered: true` and
   `@rdfjs/serializer-turtle` already do). The first edit normalizes the
   whole file; subsequent edits touch only the changed triples.

## Sources

- CSS PATCH pipeline: [PatchOperationHandler.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/ldp/PatchOperationHandler.ts),
  [N3PatchBodyParser.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/input/body/N3PatchBodyParser.ts),
  [N3Patch.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/http/representation/N3Patch.ts),
  [PatchingStore.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/PatchingStore.ts),
  [RepresentationPatchHandler.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/RepresentationPatchHandler.ts),
  [ConvertingPatcher.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/ConvertingPatcher.ts),
  [RdfPatcher.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/RdfPatcher.ts),
  [N3Patcher.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/N3Patcher.ts),
  [SparqlUpdatePatcher.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/patch/SparqlUpdatePatcher.ts),
  [QuadToRdfConverter.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/conversion/QuadToRdfConverter.ts),
  [RdfToQuadConverter.ts](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/HEAD/src/storage/conversion/RdfToQuadConverter.ts)
- CSS docs: [Patching features page](https://communitysolidserver.github.io/CommunitySolidServer/latest/architecture/features/protocol/patching/)
- Solid Protocol §5.3.1 (N3 Patch): https://solidproject.org/TR/protocol#n3-patch
- rdflib.js: [patch-parser.js](https://github.com/linkeddata/rdflib.js/blob/main/src/patch-parser.js),
  [store.ts](https://github.com/linkeddata/rdflib.js/blob/main/src/store.ts),
  [update-manager.ts](https://github.com/linkeddata/rdflib.js/blob/main/src/update-manager.ts),
  [serializer.js](https://github.com/linkeddata/rdflib.js/blob/main/src/serializer.js)
- N3.js: [N3Writer.js](https://github.com/rdfjs/N3.js/blob/main/src/N3Writer.js)
- graphy: https://github.com/blake-regalia/graphy.js
- @rdfjs/serializer-turtle: https://github.com/rdfjs-base/serializer-turtle
- @jeswr/pretty-turtle: https://github.com/jeswr/pretty-turtle
- Related: [rdf-diff-patch.md](rdf-diff-patch.md), [sparql-update.md](sparql-update.md)
