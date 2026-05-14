# Idea: New Package — `pi-kit-solid` (Solid Pod Integration)

## Problem

[Solid](https://solidproject.org/) is a W3C-aligned specification for
decentralised personal data stores built on top of Linked Data, LDP
(Linked Data Platform), and WebID. A growing number of applications and
users store personal and organisational data in Solid Pods.

The current `pi-kit-linked-data` package can read and write local RDF but has
no concept of:
- WebID-based authentication (no credentials, no agent identity).
- LDP containers (hierarchical resource storage on the Pod).
- WAC / ACP access control (reading/writing permissions).
- Solid notifications (subscribing to resource changes).

## Proposed Package: `@aveltens/pi-kit-solid`

### Tools

#### `solid_read`

```
solid_read(resourceUri, targetPath?)
```

Authenticates with the Solid Pod (using credentials from the environment or a
local session token), fetches the resource, and returns it as Turtle (or saves
to `targetPath`). Handles:
- WebID-OIDC authentication flow.
- `text/turtle`, `application/ld+json`, LDP `BasicContainer` listing.

#### `solid_write`

```
solid_write(resourceUri, turtle, contentType?)
```

Writes (PUT) or creates (POST) an RDF resource on a Solid Pod. Validates
Turtle before sending (reuses `rdf-parse.ts`). Returns the effective URI and
ETag.

#### `solid_list`

```
solid_list(containerUri)
```

Lists the contents of an LDP Container (directory on the Pod). Returns a table
of resource URIs, types, and sizes.

#### `solid_delete`

```
solid_delete(resourceUri)
```

Deletes a resource from the Pod (with confirmation prompt via the skill).

#### `solid_acl`

```
solid_acl(resourceUri, action?)
```

Reads (`action="read"`) or modifies (`action="grant"/"revoke"`) WAC access
control for a resource.

### Skill: `solid`

Guides the agent through:
1. Discovering the user's Pod URL (from WebID profile).
2. Authenticating (session token, client credentials, or interactive OIDC).
3. Reading, browsing, and modifying Pod resources.
4. Chaining with `sparql_query_files` after `solid_read` for local analysis.
5. Writing back transformed data with `solid_write`.

### Dependencies

- [`@inrupt/solid-client`](https://github.com/inrupt/solid-client-js) — the
  de-facto JS library for Solid.
- Existing `rdf-parse.ts` and `rdf-serialize.ts` from `pi-kit-linked-data`.

### Why a Separate Package?

- Solid auth adds significant dependency weight (OIDC, fetch polyfills).
- Users without a Solid Pod should not pay the cost.
- The Solid ecosystem evolves quickly; versioning separately keeps
  `pi-kit-linked-data` stable.

### Example Workflow

```
User: "Read my public profile from my Pod and summarise it."

Agent:
  1. solid_read(resourceUri="https://alice.solidcommunity.net/profile/card",
               targetPath="profile.ttl")
  2. sparql_query_files(files=["profile.ttl"],
       query="SELECT ?name ?email WHERE {
         ?s foaf:name ?name . OPTIONAL { ?s foaf:mbox ?email } }")
```
