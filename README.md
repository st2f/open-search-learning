# OpenSearch learning

This repository is a hands-on OpenSearch lab focused on how data is modeled, indexed, queried, and evolved over time. The exercises build from a single local node and explicit mappings toward schema changes, reindexing, aliases, migration safety, and integration testing.

Each section introduces one small, inspectable change so the effect on OpenSearch can be observed directly rather than hidden behind application abstractions. The examples are intentionally simple and disposable; the goal is to understand the mechanics and tradeoffs that matter when operating or changing a real search index.

## Learning path

1. [Run one local OpenSearch node](#1-run-one-local-opensearch-node)
2. [Create an index with an explicit mapping](#2-create-an-index-with-an-explicit-mapping)
3. [Index and retrieve a document from TypeScript](#3-index-and-retrieve-a-document-from-typescript)
4. [Learn `text` versus `keyword`](#4-learn-text-versus-keyword)
5. [Add object data](#5-add-object-data)
6. [Understand `object` versus `nested`](#6-understand-object-versus-nested)
7. [Inspect existing state before changing it](#7-inspect-existing-state-before-changing-it)
8. [Make a compatible mapping change](#8-make-a-compatible-mapping-change)
9. [Attempt an incompatible mapping change](#9-attempt-an-incompatible-mapping-change)
10. [Create the replacement index](#10-create-the-replacement-index)
11. [Reindex the legacy index into the new index](#11-reindex-the-legacy-index-into-the-new-index)
12. [Introduce an alias](#12-introduce-an-alias)
13. [Perform an alias-based migration](#13-perform-an-alias-based-migration)
14. [Understand reads and writes during migration](#14-understand-reads-and-writes-during-migration)
15. Add a basic integration test against local OpenSearch
16. Run OpenSearch with Testcontainers
17. Test the mapping, not just the application result
18. Test a migration against existing data
19. Deliberately break the migration
20. Model a support-monitoring document
21. Test application code against OpenSearch
22. Safe test cleanup and isolation
23. Optional: index templates
24. Final migration exercise

## Replaying the increments

Repetition is part of this lab. Read-only requests can always be rerun, and the
TypeScript examples use stable document IDs so they replace their own example
documents instead of accumulating duplicates.

Index creation is intentionally different: OpenSearch refuses to create an
index whose name already exists. Each index-creation increment therefore gives
an exact `DELETE` command for restoring that exercise to a clean state. These
commands name only disposable lab indexes; never replace them with a wildcard.

The exercises have these state boundaries:

| Increments | Indexes                                               | Replay behavior                                                                                                                                 |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2–4, 7–14  | `tickets-legacy`, `tickets-new`, then alias `tickets` | This is one evolving migration sequence. Resetting `tickets-legacy` means replaying its later mapping, data, reindex, and alias steps in order. |
| 5          | `tickets-with-service`                                | Independent; it can be reset without affecting the migration sequence.                                                                          |
| 6          | `tickets-v3`, `tickets-v4`                            | Independent; both can be reset and compared again.                                                                                              |

To reset every exercise, use `docker compose down` and then start the node
again. This repository has no persistent OpenSearch volume, so that removes all
lab indexes and lets you replay from Increment 1.

## 1. Run one local OpenSearch node

## Prerequisites

- Docker with the Compose plugin (`docker compose version`)
- `curl`
- At least 1 GB of memory available to Docker

## Start the local node

```sh
docker compose up -d
docker compose ps
```

The Compose file uses the official OpenSearch image, pinned to version `3.8.0`.
It configures a one-node cluster, gives the JVM a fixed 512 MB heap, and disables
the Security plugin. Port 9200 is bound only to the host loopback interface, so
the unsecured node is reachable from this machine but is not intentionally
published on every network interface.

This security-disabled setup is only for this disposable local lab. Never use
it for a remotely accessible or production cluster.

The first start downloads a large image and can take a few minutes. Follow its
startup if needed:

```sh
docker compose logs -f opensearch
```

When `docker compose ps` reports the service as `healthy`, verify that the node
answers:

```sh
curl --fail-with-body http://localhost:9200/
```

The JSON response identifies the node, cluster, and OpenSearch version. In this
lab, one Docker container runs one OpenSearch process, so it is also the
cluster's only node.

## Inspect OpenSearch

Cluster health:

```sh
curl --fail-with-body 'http://localhost:9200/_cluster/health?pretty'
```

The response should report `number_of_nodes: 1`. A fresh cluster should be
`green`. Later, a one-node lab can be `yellow` if an index asks for replica
shards: OpenSearch will not place a replica on the same node as its primary.

List indexes:

```sh
curl --fail-with-body 'http://localhost:9200/_cat/indices?v'
```

At this increment there is no application-specific index, so a fresh cluster
normally prints only the table headings. Internal plugins can create indexes in
some configurations; that does not make them application indexes.

Inspect all current mappings:

```sh
curl --fail-with-body 'http://localhost:9200/_mapping?pretty'
```

With no indexes, this returns an empty JSON object (`{}`). Once a specific index
exists, inspect only that index with:

```sh
curl --fail-with-body 'http://localhost:9200/<index-name>/_mapping?pretty'
```

`<index-name>` is a placeholder, not an index to create during Increment 1.

## The model so far

- A **cluster** is the complete OpenSearch system exposed to clients. It owns
  cluster-wide state and can coordinate work across one or more nodes. This lab
  has a cluster even though it has only one node.
- A **node** is one running OpenSearch process that belongs to a cluster. Nodes
  hold shards and perform indexing and search work. Here the node runs inside
  the `opensearch` container.
- An **index** is a named, distributed collection of documents plus its settings
  and mappings. Internally it is divided into shards. No application index is
  created in this increment.
- A **document** is a JSON object indexed as one searchable unit. OpenSearch
  stores indexed field structures for searching and normally retains the
  original JSON in `_source` for retrieval.
- **`_source`** is the stored JSON body supplied when a document was indexed. It
  is returned when retrieving a document, but it is distinct from the internal
  data structures OpenSearch builds for searching and aggregating.
- A document's **`_id`** identifies it within an index. The combination of index
  name and `_id` addresses a document. An ID can be supplied by the caller or
  generated by OpenSearch.

An OpenSearch index is not simply a SQL table. A mapping has a schema-like role,
but an index is also a physical search structure split into shards. Its field
types control analysis and search representation, documents can contain nested
JSON structures, and mapping changes are constrained by already-built search
structures. Those differences become concrete in later increments.

```txt
cluster
└── index: tickets-legacy
    ├── document: ticket-1
    ├── document: ticket-2
    └── mapping: field definitions
```

Rough analogy

| SQL           | OpenSearch                               |
| ------------- | ---------------------------------------- |
| Database      | Cluster, or sometimes an index namespace |
| Table         | Index                                    |
| Row           | Document                                 |
| Column schema | Mapping                                  |
| Primary key   | Document `_id`                           |

## 2. Create an index with an explicit mapping

A **mapping** defines how document fields are indexed: their names, types, and
type-specific behavior. It is similar to part of a database schema, but it
primarily describes search and indexing behavior.

### Create `tickets-legacy`

If you are replaying Increment 2, reset its disposable index first:

```sh
curl --fail-with-body \
  --request DELETE \
  'http://localhost:9200/tickets-legacy?ignore_unavailable=true'
```

This also resets the shared state used by Increments 3, 4, and 7 onward. Replay
those increments in order when you want to rebuild the migration sequence.

The complete index definition is in
[`mappings/tickets-legacy.json`](mappings/tickets-legacy.json). Create it
directly with the OpenSearch REST API:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-legacy' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-legacy.json'
```

`PUT /tickets-legacy` creates the named index. The request includes both its
settings and mapping; it does not index a document.

This disposable one-node lab uses one primary shard and zero replicas. Zero
replicas keeps cluster health green because a replica cannot be allocated to the
same node as its primary. This is a local-learning choice, not a production
default.

Confirm that the index exists but still contains zero documents:

```sh
curl --fail-with-body 'http://localhost:9200/_cat/indices/tickets-legacy?v'
```

Inspect the mapping returned by OpenSearch rather than only trusting the request
file:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

### Field choices

| Field                 | Type      | Reason                                                                                                                                                                         |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customerId`          | `keyword` | An identifier is an exact value; it should not be broken into search tokens.                                                                                                   |
| `title`               | `text`    | Human-written titles are intended for full-text search and are analyzed into tokens.                                                                                           |
| `status`              | `keyword` | A status is a finite exact value used for equality filters and aggregations.                                                                                                   |
| `dueDate`             | `date`    | OpenSearch parses it as a date, enabling date validation, ranges, and date-aware sorting. `strict_date` accepts the planned `YYYY-MM-DD` value without accepting looser forms. |
| `responseTimeMinutes` | `integer` | This is a whole-number measurement, so numeric ranges and sorting should use numeric rather than textual semantics.                                                            |

A **field type** controls how OpenSearch validates and converts a value and
which internal search structures it builds. The JSON representation alone does
not communicate all of that intent: both an identifier and prose arrive as JSON
strings, but `keyword` and `text` index those strings differently.

### Explicit and dynamic mappings

An **explicit mapping** declares field types before documents arrive, as this
lab does. With **dynamic mapping**, OpenSearch sees an undeclared field in a
document and infers a mapping from the first value it receives. For example, a
date-looking string might become a `date`, while another string becomes `text`
with a `keyword` subfield, depending on index settings and detection rules.

That first inferred type becomes part of the index mapping. It is not inferred
again for every document, and most existing field types cannot simply be
changed in place. A misleading first value can therefore create later indexing
failures or incorrect search behavior and ultimately require a new index plus
reindexing.

The mapping uses `"dynamic": "strict"`. If a later document contains an
undeclared field, OpenSearch rejects that document rather than silently growing
the mapping. This makes schema mistakes visible during the exercise. Dynamic
mapping can be convenient for exploration, but uncontrolled fields can cause
type surprises, inconsistent environments, and mapping growth in long-lived
systems.

## 3. Index and retrieve a document from TypeScript

Install the locked dependencies:

```sh
npm ci
```

The only direct dependency is the official OpenSearch JavaScript client. This
lab requires Node.js 24, which can run the erasable TypeScript syntax used here
without a separate runtime such as `tsx` or `ts-node`. Node strips the type
annotations before execution; it does not perform TypeScript type checking.

Make sure OpenSearch is running and that `tickets-legacy` has been created
using the Increment 2 command. Then run:

```sh
npm run ticket
```

The script in [`src/index-ticket.ts`](src/index-ticket.ts) performs two direct
client calls:

```text
TypeScript
  ↓
OpenSearch JavaScript client
  ↓
tickets-legacy
```

1. `client.index(...)` sends one ticket document with the explicit `_id`
   `ticket-1`.
2. `client.get(...)` retrieves that document by its index and `_id`.
3. The script prints the returned `_source`.

The `Ticket` type checks the document shape when a TypeScript checker is used.
It does not create or enforce the OpenSearch mapping at runtime; the mapping and
the TypeScript type are separate definitions that currently agree.

### Indexing, IDs, and `_source`

**Indexing** validates the supplied values against the mapping and updates the
index's internal search structures. The document's `_id` is metadata, so it is
passed separately from the document body. An `_id` is unique only within its
index; `tickets-legacy` plus `ticket-1` identifies this document.

The basic write operations have different intentions:

- The index operation creates a document when the `_id` is new and replaces the
  document when that `_id` already exists. Running this script repeatedly is
  therefore safe for the exercise, but the result changes from `created` to
  `updated`.
- A create operation is insert-only and fails if the `_id` already exists.
- An update operation applies a partial update or scripted change to an existing
  document rather than supplying a complete replacement.

`_source` is the original JSON object stored for retrieval. It is not the same
thing as the analyzed terms and other internal structures used during search.
The TypeScript client response exposes it as `getResponse.body._source`.

### Refresh and search visibility

An acknowledged indexing request does not necessarily make the document
immediately visible to search queries. A **refresh** makes recent shard changes
searchable, and OpenSearch normally refreshes active indexes periodically.

Retrieval by `_id`, as used here, is real-time by default and can see the newly
indexed document without waiting for a refresh. That is why this script does not
request a manual refresh. When a workflow truly must search for its own write,
the index API supports `refresh: "wait_for"`, which waits for the next refresh.
Forcing a refresh after every write is generally avoided because it adds work
and reduces indexing throughput.

## 4. Learn `text` versus `keyword`

The mapping has not changed. Inspect it again before running the queries:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

Notice that `title` is `text`, while `status` is `keyword`. The script in
[`src/search-tickets.ts`](src/search-tickets.ts) indexes four tickets and runs
three queries that expose the difference.

Before running it, predict the results:

1. Will a full-text query for uppercase `PAYMENT` match titles containing
   `Payment`?
2. Which documents have the exact status `open`?
3. Will an exact `term` query for capitalized `Payment` work correctly against
   the `text` title field?

Then run:

```sh
npm run search
```

The script uses stable document IDs, so it can be rerun without creating
duplicates. It explicitly refreshes once after indexing all four documents so
the queries produce deterministic results immediately. This is useful for the
exercise; production indexing normally relies on periodic refreshes or uses
`refresh: "wait_for"` only when immediate search visibility is required.

After reruns, `_cat/indices` may show a nonzero `docs.deleted` even though there
are still only four current documents. Internally, replacing a document writes
a new version and marks the old version as deleted; a later segment merge can
reclaim it.

### `text`: analyzed content

The first query is a `match` query against `title`:

```json
{
  "match": {
    "title": "PAYMENT"
  }
}
```

A `text` field is intended for full-text search. During indexing, its
**analyzer** transforms text into **tokens**. With the default standard analyzer,
`Payment service unavailable` produces tokens similar to `payment`, `service`,
and `unavailable`. A `match` query analyzes its query text in the same way, so
uppercase `PAYMENT` becomes `payment` and matches `ticket-1` and `ticket-2`.

Full-text queries run in query context: they can calculate a relevance `_score`
describing how well each document matches.

### `keyword`: exact values

The second query places a `term` query against `status` in `bool.filter`:

```json
{
  "bool": {
    "filter": {
      "term": {
        "status": "open"
      }
    }
  }
}
```

A `keyword` field represents one exact value; `open` remains the single value
`open`. It is appropriate for identifiers, statuses, sorting, aggregations, and
exact matching. Because this clause is in filter context, OpenSearch answers a
yes/no question and does not calculate relevance scores. It matches `ticket-1`
and `ticket-3`.

Filtering is appropriate when documents either satisfy a structured condition
or do not. Full-text search is appropriate when documents may match human text
to different degrees.

### The intentionally inappropriate query

The third query uses `term` against `title`:

```json
{
  "term": {
    "title": "Payment"
  }
}
```

A `term` query does not analyze its input. It looks for the exact token
`Payment`, but the title analyzer stored the lowercase token `payment`, so this
query returns no matches. Changing the query to lowercase might happen to find
documents, but it would still couple the application to analyzer output and
would not be the correct general-purpose full-text query.

Conversely, `match` can technically target a `keyword` field, but it does not
turn that field into full text: the keyword analyzer still treats the entire
value as one token. Prefer `match` for analyzed prose and `term`/filter context
for exact structured values so the intent is explicit.

This increment does not add `title.keyword`. Such a multi-field is useful only
when the same title must support both full-text search and exact-value
sorting/aggregation; the current queries do not require it.

## 5. Add object data

Tickets now include a service object:

```json
{
  "service": {
    "id": "service-42",
    "name": "Payments API"
  }
}
```

This increment uses a new disposable index, `tickets-with-service`, whose
complete mapping is in
[`mappings/tickets-with-service.json`](mappings/tickets-with-service.json).
Adding an object field is a supported additive mapping change, so a new index is
not technically required here. Keeping `tickets-legacy` unchanged makes the two
learning states independently inspectable and avoids mutating the previous
exercise implicitly. Its descriptive name also separates it from the migration
indexes.

Create the index:

```sh
curl --fail-with-body \
  --request DELETE \
  'http://localhost:9200/tickets-with-service?ignore_unavailable=true'
```

That scoped reset makes the following creation request replayable without
touching the other exercises:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-with-service' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-with-service.json'
```

Inspect its mapping and compare it with `tickets-legacy`:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-with-service/_mapping?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

The returned mapping may omit the explicit `"type": "object"` from `service`.
An object containing `properties` is the default object representation, so the
mapping is still an `object`; OpenSearch has only normalized the response.

Then index three tickets and query by service:

```sh
npm run search:service
```

The query uses the dotted field path `service.id`:

```json
{
  "bool": {
    "filter": {
      "term": {
        "service.id": "service-42"
      }
    }
  }
}
```

It matches the two tickets belonging to the Payments API.

### Objects and dot notation

The `service` field is mapped as `object`, with its own explicitly mapped
properties. `service.id` is `keyword` because it is queried as an exact
identifier. `service.name` is `text` because it is human-readable content.
`dynamic: "strict"` on the object makes undeclared service properties fail
indexing instead of being mapped accidentally.

The mapping represents the hierarchy with nested `properties` objects, while
queries address leaf fields using dot notation such as `service.id`. Conceptually,
OpenSearch indexes the leaf values under paths like:

```text
service.id   -> service-42
service.name -> analyzed terms: payments, api
```

The stored `_source` still preserves the original JSON shape:

```text
service: { id: "service-42", name: "Payments API" }
```

The `service` object is not a separate OpenSearch document, table, or joined
record. Its values are part of each ticket document and are duplicated when
multiple tickets refer to the same service. OpenSearch does not enforce a
foreign key between `service.id` and another index.

This is a normal `object`, not the special `nested` field type. That distinction
matters when a field contains an array of objects and is the subject of
Increment 6.

## 6. Understand `object` versus `nested`

This increment uses the same event history in two indexes. `tickets-v3` maps
`events` as a normal `object`; `tickets-v4` maps it as `nested`. Keeping both
indexes makes the behavioral difference directly observable.

Reset both disposable indexes when replaying this comparison:

```sh
curl --fail-with-body \
  --request DELETE \
  'http://localhost:9200/tickets-v3,tickets-v4?ignore_unavailable=true'
```

Create the normal-object index:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-v3' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-v3.json'
```

Index the example tickets and run the normal object query:

```sh
npm run search:events
```

The query requires both leaf-field predicates, but it returns `ticket-1` and
`ticket-2`. For `ticket-1`, a conceptual view of the flattened indexed values
is:

```text
events.type    -> [ASSIGNED, RESOLVED]
events.actorId -> [agent-7, agent-9]
```

Both requested values exist in the ticket, but they do not belong to the same
event. A normal object array does not preserve that association for querying.

Now create the nested index:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-v4' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-v4.json'
```

Run the nested version of the query:

```sh
npm run search:events:nested
```

The `nested` query names `events` as its `path` and places both `term` clauses
inside that query. They must therefore match the same event, so only `ticket-2`
is returned.

OpenSearch implements each nested array element as a hidden internal document.
This preserves per-element field associations, but increases the number of
internally indexed documents and requires nested-aware queries, aggregations,
and sorting. Use a normal object when cross-property association is irrelevant;
use `nested` when predicates on several properties must apply to the same array
element.

## 7. Inspect existing state before changing it

This increment makes no mapping or data changes. The aim is to inspect the
actual index before deciding whether a proposed change can be applied in place.
The mapping file in the repository describes the intended starting state, but
OpenSearch is the authority for the state that currently exists.

Make sure the local node is running, then list the indexes rather than assuming
that `tickets-legacy` exists:

```sh
curl --fail-with-body 'http://localhost:9200/_cat/indices?v'
```

If `tickets-legacy` is absent, create it with the Increment 2 command. Its
document count may legitimately be zero, one, or four depending on which
earlier scripts you have run.

### Inspect `tickets-legacy`

Inspect the live mapping:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

Compare that response with
[`mappings/tickets-legacy.json`](mappings/tickets-legacy.json). The expected
fields are `customerId` (`keyword`), `title` (`text`), `status`
(`keyword`), `dueDate` (`date`), and `responseTimeMinutes` (`integer`), with
dynamic mapping set to `strict`. Comparing the file and the live response can
expose manual changes, a stale local index, or a deployment that did not apply
the intended definition.

Inspect the index settings:

```sh
curl --fail-with-body \
  'http://localhost:9200/tickets-legacy/_settings?flat_settings=true&pretty'
```

The response includes the explicitly chosen one primary shard and zero
replicas, together with metadata such as the index creation version and UUID.
Settings are separate from mappings: settings configure index behavior and
physical characteristics, while mappings define how fields are indexed.

Ask the Count API for the number of current top-level ticket documents:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
```

This is preferable to treating the `_cat/indices` `docs.count` column as an
exact application-level row count. Cat APIs are intended for human inspection,
and Lucene-level counts can be affected by internal documents (for example,
nested values) and refresh timing.

Finally, inspect a small sample of stored documents:

```sh
curl --fail-with-body \
  --request GET 'http://localhost:9200/tickets-legacy/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "size": 3,
    "query": {
      "match_all": {}
    }
  }'
```

Each hit shows metadata such as `_index`, `_id`, and `_score`, plus the stored
ticket JSON in `_source`. A sample helps reveal real shapes and values, but it
does not prove that every document conforms to an application-level invariant.
Use aggregations or a full scan when a migration decision depends on all data.

### Before changing an OpenSearch index

1. **What index exists?** Inspect the cluster, including the exact physical
   index name; do not infer deployed state only from repository files.
2. **What mapping does it currently have?** Read the live mapping and compare
   field types, analyzers, object structures, and dynamic-mapping rules with the
   proposed definition.
3. **What data is already indexed?** Check the document count and representative
   documents, then use a complete validation when the proposed change depends
   on existing values.
4. **Which applications read from it?** In this repository,
   [`src/index-ticket.ts`](src/index-ticket.ts) retrieves a ticket by `_id`, and
   [`src/search-tickets.ts`](src/search-tickets.ts) runs searches against
   `tickets-legacy`.
5. **Which applications write to it?** Both of those scripts index documents
   directly into `tickets-legacy`. In a real system, also inspect deployed
   services, scheduled jobs, ingestion pipelines, and other clients that may
   not live in the same repository.
6. **Is the proposed change compatible with the existing mapping?** Consider
   both whether OpenSearch accepts the mapping update and whether every current
   reader, writer, query, and existing document remains semantically correct.

Repository search is a useful starting point for finding direct dependencies:

```sh
rg -n 'tickets-legacy' src package.json
```

It is not a complete inventory of a shared index. Runtime configuration,
aliases, or clients in other repositories can hide the physical index name, so
production discovery also needs operational evidence such as deployment
configuration and index-access metrics.

### Why this is not an empty-database migration

A common relational workflow starts an empty database and applies an ordered
series of schema migrations until it reaches the current schema. That is useful
for testing reproducibility, but it does not by itself model an OpenSearch
change to a populated index:

```text
existing mapping + indexed search structures + existing documents
                           + active readers and writers
                                      ↓
                         migration compatibility decision
```

An OpenSearch mapping controls the search representation built when each field
is indexed. Adding certain fields is compatible, but an existing field's type
or analyzer generally cannot be replaced in place because its already-built
terms and other structures do not get reinterpreted. Such a change normally
needs a new index with the desired mapping and a reindex of `_source`, followed
by coordinated traffic switching. Later increments exercise that process.

The closest SQL analogy is altering a populated table while applications are
using it, not merely initializing an empty database. Relational databases can
support many in-place `ALTER TABLE` operations and may update or validate rows
as part of a migration. Those operations still have compatibility, locking,
rewrite, and deployment concerns, depending on the database and change.
OpenSearch has different constraints: its mapping is tied directly to
distributed search structures, and many incompatible changes require building
a separate index rather than altering the existing one.

No schema update is made in this increment. The next increment can use this
inspection baseline to demonstrate a compatible additive mapping change.

## 8. Make a compatible mapping change

This increment adds `priority` to the existing `tickets-legacy` mapping. It does
not replace the index or modify the original Increment 2 mapping file; the
separate update file preserves the before-and-after steps of the exercise.

First inspect the live mapping and confirm that it does not already contain
`priority`:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

The mapping update body is in
[`mappings/tickets-legacy-add-priority.json`](mappings/tickets-legacy-add-priority.json)
contains:

```json
{
  "properties": {
    "priority": {
      "type": "keyword"
    }
  }
}
```

Apply it to the existing index:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-legacy/_mapping' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-legacy-add-priority.json'
```

`PUT /tickets-legacy/_mapping` updates the mapping of that index; it does not
create a new index. This particular request is safe to repeat because it
declares the same type for the same field. Inspect the live mapping again and
verify that `priority` is now a `keyword` while every earlier field is
unchanged:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
```

`keyword` is appropriate because priority is a structured exact value used for
filtering, not prose for full-text search. The mapping does not enforce a fixed
set of allowed keyword values. The TypeScript example narrows its compile-time
type to `"low" | "normal" | "high"`, but OpenSearch would still accept another
string unless validation is added outside this mapping.

### Compare old and new document shapes

Run the focused example after applying the mapping update:

```sh
npm run search:priority
```

[`src/search-tickets-by-priority.ts`](src/search-tickets-by-priority.ts) indexes
two documents with stable IDs:

- `ticket-5` represents an older writer and omits `priority`.
- `ticket-6` represents a newer writer and sends `priority: "high"`.

The `priority?` property in the TypeScript `Ticket` type is optional: the `?`
allows either document shape at compile time. It does not make an OpenSearch
mapping change or perform runtime validation.

The script refreshes once, then performs three searches limited to those two
IDs. The first returns both document styles and prints `undefined` for the
missing TypeScript property on `ticket-5`. The second uses an exact `term`
filter and returns only `ticket-6`. The third uses an `exists` query inside
`must_not` and returns only `ticket-5`, which has no indexed `priority` value.

### Why the change is compatible

No existing search representation was assigned to the new field name, so
OpenSearch can add the `priority` definition without reinterpreting old indexed
values. New documents can now index that field. Existing documents are not
rewritten or backfilled: their `_source` remains exactly as it was, and they
have no indexed term for `priority`. This is why no reindex is needed for this
exercise.

`dynamic: "strict"` distinguishes **known fields** from **unknown fields**; it
does not make known fields required. Before this mapping update, `priority` was
unknown and a document containing it would be rejected. After the update,
`priority` is known but still optional.

### Field absence is not quite SQL `NULL`

After adding a nullable SQL column, every row has that column in the table's
schema; pre-existing rows normally observe `NULL` until a value or default is
provided. OpenSearch documents retain their individual JSON shapes. An older
document can have no `priority` key in `_source` at all.

By default, both an absent field and a field explicitly supplied as JSON `null`
produce no indexed value, so an `exists` query does not distinguish them.
Their `_source` can still distinguish `{}` from `{ "priority": null }`.

Do not reindex for this increment. The unchanged older document is the evidence
that an additive mapping update does not rewrite existing data.

## 9. Attempt an incompatible mapping change

Suppose response times must now support fractions of a minute, such as `2.5`.
That gives us a concrete reason to change `responseTimeMinutes` from `integer`
to `float`. OpenSearch rejects this change on the existing index. Leave
`tickets-legacy` in place after the failure; the next increment creates a
separate replacement.

First confirm the live field type and inspect a document that contains the
field:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_mapping?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'

curl --fail-with-body \
  'http://localhost:9200/tickets-legacy/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "size": 1,
    "query": {
      "exists": {
        "field": "responseTimeMinutes"
      }
    }
  }'
```

The mapping should report `"type": "integer"`; `_source` shows a whole number
such as `30`. The rejected update is in
[`mappings/tickets-legacy-change-response-time-to-float.json`](mappings/tickets-legacy-change-response-time-to-float.json):

```json
{
  "properties": {
    "responseTimeMinutes": {
      "type": "float"
    }
  }
}
```

Attempt to apply it to the existing index:

```sh
curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-legacy/_mapping' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-legacy-change-response-time-to-float.json'
```

This command is expected to fail. With the pinned OpenSearch version, the
response is HTTP `400 Bad Request` and its essential cause is:

```text
illegal_argument_exception:
mapper [responseTimeMinutes] cannot be changed from type [integer] to [float]
```

The exact JSON envelope may contain repeated `root_cause` and `caused_by`
details. `curl --fail-with-body` prints that useful error body and exits with a
nonzero status, so the failure is observable both by a person and by a script.

Run the same mapping, count, and sample-document inspections again. This
confirms that the rejected request changed neither the mapping, document count,
nor sampled document.

### Why OpenSearch refuses the change

The mapping type determines how values are indexed. Changing its label would
not rebuild the structures already created for that field, so OpenSearch
rejects the update. Existing whole-number values will be valid floats in the
replacement index, but they still have to be read from `_source` and indexed
again under the new mapping.

Some relational databases support an operation such as `ALTER TABLE ... ALTER
COLUMN ... TYPE`, potentially validating or rewriting stored rows and indexes
as one managed schema migration. Details, locking, and supported conversions
vary by database. OpenSearch provides no equivalent in-place rewrite for this
field-type change. The usual pattern is to create a new index with the desired
mapping, reindex or transform the old `_source` documents, validate the result,
and then switch traffic. Do not do that yet; Increment 10 introduces the new
index explicitly.

## 10. Create the replacement index

For this migration, think in roles rather than version numbers:

```text
legacy: tickets-legacy   new: tickets-new
integer response time    float response time
existing documents       empty
```

`tickets-legacy` stays populated and unchanged. The complete replacement
mapping is in [`mappings/tickets-new.json`](mappings/tickets-new.json).

Reset and create only the new index:

```sh
curl --fail-with-body \
  --request DELETE \
  'http://localhost:9200/tickets-new?ignore_unavailable=true'

curl --fail-with-body \
  --request PUT 'http://localhost:9200/tickets-new' \
  --header 'Content-Type: application/json' \
  --data-binary '@mappings/tickets-new.json'
```

Inspect the old and new states:

```sh
curl --fail-with-body \
  'http://localhost:9200/tickets-legacy,tickets-new/_mapping?pretty'

curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'
```

The legacy index still contains its documents and maps
`responseTimeMinutes` as `integer`. The new index maps it as `float` and has no
documents yet.

The names are ordinary physical index names; `legacy` and `new` describe their
roles in this exercise. Keeping the legacy index makes comparison and rollback
possible. Once writes go only to the new index, rollback needs extra care
because those writes are not present in the legacy index.

Do not copy data yet. That is Increment 11.

## 11. Reindex the legacy index into the new index

Start with the state from Increment 10: `tickets-legacy` is populated and
`tickets-new` exists with the `float` mapping but is empty.

Confirm those preconditions:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_mapping?pretty'
```

Now ask OpenSearch to reindex every document:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_reindex?refresh=true&pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "source": {
      "index": "tickets-legacy"
    },
    "dest": {
      "index": "tickets-new"
    }
  }'
```

On a clean destination, the response should show the source count in `total`
and `created`, zero failures, and no version conflicts. Repeating the request
uses the same document IDs, so documents are updated rather than duplicated.
`refresh=true` makes the copied documents visible to the immediate verification
queries. Replay Increment 10 first if you want to observe a clean reindex again.

Compare counts and inspect the copied documents:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'

curl --fail-with-body \
  'http://localhost:9200/tickets-new/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "size": 3,
    "query": {
      "match_all": {}
    }
  }'
```

The `_source` values still look like the original JSON—for example,
`responseTimeMinutes` may still be `30`. Reindex reads each legacy `_source`
and sends it through the new mapping; it does not rewrite the stored JSON value
from `30` to `30.0`. The destination nevertheless indexes that value as a
`float`.

The copied examples contain only whole numbers, so they do not demonstrate the
reason for choosing `float`. Add one temporary document with a fractional
response time:

```sh
curl --fail-with-body \
  --request PUT \
  'http://localhost:9200/tickets-new/_doc/fractional-check?refresh=wait_for' \
  --header 'Content-Type: application/json' \
  --data '{
    "customerId": "mapping-check",
    "title": "Fractional response-time check",
    "status": "test",
    "dueDate": "2026-09-21",
    "responseTimeMinutes": 2.5
  }'
```

Query the indexed value rather than merely reading it back from `_source`:

```sh
curl --fail-with-body \
  'http://localhost:9200/tickets-new/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "_source": false,
    "fields": ["responseTimeMinutes"],
    "query": {
      "term": {
        "responseTimeMinutes": 2.5
      }
    }
  }'
```

The result contains `fractional-check` with a field value of `2.5`. That is
direct evidence that the destination indexed and can exactly query the
fractional value required by the new model.

Remove the validation document so both indexes return to the same document
count:

```sh
curl --fail-with-body \
  --request DELETE \
  'http://localhost:9200/tickets-new/_doc/fractional-check?refresh=true'

curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'
```

The destination mapping had to be prepared first. Reindex copies documents,
not the source mapping or index settings; allowing automatic index creation
could produce inferred types instead of the mapping we intended. On a large
index, reindex is substantial work because OpenSearch must read every source
document and perform a new indexing write for every destination document.

Keep `tickets-legacy`. The next increments use it to introduce an alias and to
practice switching and rollback.

## 12. Introduce an alias

Start with the state produced by Increment 11: `tickets-legacy` and
`tickets-new` both exist and contain the copied documents, but no application
alias is required yet. This increment creates the stable logical name
`tickets` and points it at the legacy physical index:

```text
Application
    ↓
tickets (alias)
    ↓
tickets-legacy (physical index)

tickets-new (physical index, not selected yet)
```

The replacement index stays populated but unused through the alias. Increment
13 performs the switch; do not switch it in this increment.

### Create or reset the alias

Use one aliases request to establish the exact starting relationship:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-new",
          "alias": "tickets",
          "must_exist": false
        }
      },
      {
        "add": {
          "index": "tickets-legacy",
          "alias": "tickets"
        }
      }
    ]
  }'
```

The narrowly scoped `remove` makes this command replayable after a later alias
switch: if `tickets` points to `tickets-new`, that relationship is removed; if
it does not, `must_exist: false` makes the action a no-op. The `add` then makes
sure the alias points to `tickets-legacy`. Both actions are evaluated as one
cluster-state update, so the reset does not expose an intermediate alias state.

Inspect aliases and confirm the relationship rather than assuming the request
had the intended effect:

```sh
curl --fail-with-body 'http://localhost:9200/_cat/aliases/tickets?v'
curl --fail-with-body 'http://localhost:9200/_alias/tickets?pretty'
```

Both responses should identify `tickets-legacy` as the physical index behind
`tickets`. The alias does not copy documents or create another set of search
structures; it is cluster metadata that resolves a name to an existing index.

### Read through the logical name

Run the Increment 12 application example:

```sh
npm run ticket:alias
```

[`src/read-ticket-through-alias.ts`](src/read-ticket-through-alias.ts) asks for
`ticket-1` from `tickets`; it contains no physical index name. The response
prints `tickets-legacy` as the resolved `_index`, followed by the stored
`_source`. This proves that the request used the alias while OpenSearch read the
document from the underlying physical index.

The earlier TypeScript files deliberately retain their physical names because
they are runnable examples for Increments 3, 4, and 8, which precede alias
creation. In an application being migrated, the equivalent change would be to
replace its configured physical name with `tickets`. From this increment
onward, the alias-facing script represents that application caller.

### Physical indexes and stable logical names

A **physical index** owns mappings, settings, shards, and documents. Here,
`tickets-legacy` and `tickets-new` are two separate physical indexes with
different mappings. An **alias** is another cluster-managed name that resolves
to one or more indexes; here, `tickets` resolves to exactly one.

The application can depend on the stable role-based name `tickets` while an
operator chooses which physical index currently fulfils that role. A later
migration can build and validate a replacement index without changing every
caller. The alias can then be updated in one atomic operation, and the same
application request resolves to the replacement. The alias is routing
indirection, not migration by itself: data still has to be copied and verified,
and concurrent writes require separate consideration in later increments.

## 13. Perform an alias-based migration

Start with both physical indexes populated and the alias on the legacy index:

```text
Application
    ↓
tickets (alias)
    ↓
tickets-legacy

tickets-new (already populated)
```

Re-establish that exact alias state before replaying the exercise, even if you
have already performed its final switch:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-new",
          "alias": "tickets",
          "must_exist": false
        }
      },
      {
        "add": {
          "index": "tickets-legacy",
          "alias": "tickets"
        }
      }
    ]
  }'

curl --fail-with-body 'http://localhost:9200/_cat/aliases/tickets?v'
```

This reset is narrowly scoped to the two indexes in this migration. It neither
deletes an index nor changes any documents.

Before switching, confirm that the destination is still ready:

```sh
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_mapping?pretty'
npm run ticket:alias
```

The counts should agree, the destination should map `responseTimeMinutes` as
`float`, and the TypeScript reader should report `tickets-legacy`.

### Switch to the replacement index

Send the removal and addition in one Aliases API request:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-legacy",
          "alias": "tickets",
          "must_exist": true
        }
      },
      {
        "add": {
          "index": "tickets-new",
          "alias": "tickets"
        }
      }
    ]
  }'
```

OpenSearch applies the actions as one atomic cluster-state update. Callers see
the alias relationship before or after the update; they are not exposed to the
missing-alias interval that two separate requests would create. Keeping both
actions together also avoids accidentally leaving the alias attached to both
indexes, which would make a read search both of them.

Verify the result through the alias:

```sh
curl --fail-with-body 'http://localhost:9200/_cat/aliases/tickets?v'
curl --fail-with-body 'http://localhost:9200/tickets/_mapping?pretty'
curl --fail-with-body 'http://localhost:9200/tickets/_count?pretty'
npm run ticket:alias
```

The mapping response is keyed by `tickets-new`, its response-time field is a
`float`, and the unchanged TypeScript reader now reports `tickets-new`. The
caller still asks for `tickets`; only cluster alias metadata changed.

### Roll back once

Practice the reverse operation while the exercise data is still identical:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-new",
          "alias": "tickets",
          "must_exist": true
        }
      },
      {
        "add": {
          "index": "tickets-legacy",
          "alias": "tickets"
        }
      }
    ]
  }'

npm run ticket:alias
```

That does not make every real rollback safe: once new writes or new-only document shapes reach the replacement index, the legacy index may no longer contain equivalent data. Increment 14 examines that write-consistency problem.

### Finish on the new index

Repeat the atomic forward switch so the final state is ready for the next
increment:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-legacy",
          "alias": "tickets",
          "must_exist": true
        }
      },
      {
        "add": {
          "index": "tickets-new",
          "alias": "tickets"
        }
      }
    ]
  }'

npm run ticket:alias
```

The final relationship is:

```text
Application (unchanged)
    ↓
tickets (alias)
    ↓
tickets-new

tickets-legacy (retained for comparison and possible rollback)
```

Changing a stable alias is safer than coordinating a physical-name change in
every caller: the routing decision is centralized and atomic, and rollback can
use the same mechanism while the two indexes remain data-compatible. It does
not remove the need to validate mappings, copied data, queries, and active
writes before switching.

## 14. Understand reads and writes during migration

Increment 11 copied the documents that existed at reindex time. Now simulate a
write that arrives afterward:

```text
reindex finishes → new write reaches legacy → alias switches
                                            ↓
                          write is absent from the new index
```

### Restore the experiment's starting state

Remove only this increment's example ID from both indexes, then point the alias
back to the legacy index:

```sh
curl --fail-with-body \
  --request POST \
  'http://localhost:9200/tickets-legacy,tickets-new/_delete_by_query?refresh=true&pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": {
      "ids": {
        "values": ["ticket-after-reindex"]
      }
    }
  }'

curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-new",
          "alias": "tickets",
          "must_exist": false
        }
      },
      {
        "add": {
          "index": "tickets-legacy",
          "alias": "tickets"
        }
      }
    ]
  }'
```

The delete-by-query is deliberately restricted to one stable ID, so the reset
is safe to repeat.

### Write after reindexing

Write a new ticket through the application alias and verify:

```sh
curl --fail-with-body \
  --request PUT \
  'http://localhost:9200/tickets/_doc/ticket-after-reindex?refresh=wait_for&pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "customerId": "customer-late",
    "title": "Ticket created after reindex",
    "status": "open",
    "dueDate": "2026-09-22",
    "responseTimeMinutes": 12,
    "priority": "normal"
  }'

curl --fail-with-body \
  'http://localhost:9200/tickets/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": {
      "ids": {
        "values": ["ticket-after-reindex"]
      }
    }
  }'
```

### Switch and observe the gap

Perform the same atomic alias switch as Increment 13:

```sh
curl --fail-with-body \
  --request POST 'http://localhost:9200/_aliases' \
  --header 'Content-Type: application/json' \
  --data '{
    "actions": [
      {
        "remove": {
          "index": "tickets-legacy",
          "alias": "tickets",
          "must_exist": true
        }
      },
      {
        "add": {
          "index": "tickets-new",
          "alias": "tickets"
        }
      }
    ]
  }'

curl --fail-with-body \
  'http://localhost:9200/tickets/_search?pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": {
      "ids": {
        "values": ["ticket-after-reindex"]
      }
    }
  }'
```

The search through `tickets` now returns zero hits because the alias resolves
to `tickets-new`. The alias update was atomic, but it only changed routing; it
did not synchronize the two indexes.

### Migration strategies

- **Pause writes briefly:** stop writers, finish copying and validation, then
  switch. This is simple but introduces a write outage.
- **Dual write:** send changes to both indexes. This avoids a pause but needs a
  plan for partial failures, ordering, updates, and deletes.
- **Catch up changes:** record changes that occur during the bulk reindex and
  apply them before switching. A reliable change log is safer than assuming an
  `updatedAt` query captures every update and deletion.
- **Rebuild from a source of truth:** generate both indexes from the system that
  owns the data when OpenSearch is only a search projection.
- **Use a write alias:** centralize the current write target. This makes routing
  changes easier, but does not by itself copy writes made during reindexing.

The appropriate choice depends on tolerated downtime, data ownership, write
volume, and how much synchronization machinery is justified.

### Clean up

Remove the demonstration document and keep the alias on `tickets-new`, matching
the ending state of Increment 13:

```sh
curl --fail-with-body \
  --request POST \
  'http://localhost:9200/tickets-legacy,tickets-new/_delete_by_query?refresh=true&pretty' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": {
      "ids": {
        "values": ["ticket-after-reindex"]
      }
    }
  }'

curl --fail-with-body 'http://localhost:9200/_cat/aliases/tickets?v'
curl --fail-with-body 'http://localhost:9200/tickets-legacy/_count?pretty'
curl --fail-with-body 'http://localhost:9200/tickets-new/_count?pretty'
```

## Stop or reset the lab

Stop and remove the container:

```sh
docker compose down
```

This increment does not mount a persistent data volume. Removing the container
therefore removes its cluster data, which keeps the experiment disposable.
