# TypeScript OpenSearch client cheat sheet

This repository uses `@opensearch-project/opensearch` 3.6.0 with OpenSearch
3.8.0. The examples below follow the response shapes and method names used by
that version.

## Connect and close

```ts
import { Client } from "@opensearch-project/opensearch";

const client = new Client({ node: "http://localhost:9200" });

try {
  // Use the client.
} finally {
  client.close();
}
```

Create one client for an application or test-suite lifecycle rather than one
per request. The client manages reusable HTTP connections. Closing it releases
those resources; `close()` is synchronous in the client version pinned here.

Tests using Testcontainers replace the fixed URL with the runtime URL:

```ts
const client = new Client({ node: container.getHttpUrl() });
```

## Method map

| TypeScript client call | REST equivalent | Purpose | Rough SQL comparison |
| --- | --- | --- | --- |
| `client.index(...)` | `PUT /index/_doc/id` | Create or replace one document | `INSERT` or full-row upsert |
| `client.get(...)` | `GET /index/_doc/id` | Retrieve one document by `_id` | Primary-key lookup |
| `client.search(...)` | `GET /index/_search` | Run query DSL, sorting, and aggregations | `SELECT ... WHERE ...` |
| `client.count(...)` | `GET /index/_count` | Count matching documents | `SELECT COUNT(*)` |
| `client.reindex(...)` | `POST /_reindex` | Copy documents between indexes | `INSERT ... SELECT`, but between search structures |
| `client.indices.create(...)` | `PUT /index` | Create a physical index with settings and mappings | `CREATE TABLE`, only approximately |
| `client.indices.delete(...)` | `DELETE /index` | Delete a physical index and its documents | `DROP TABLE` |
| `client.indices.refresh(...)` | `POST /index/_refresh` | Make recent writes visible to search immediately | No close SQL equivalent |
| `client.indices.getMapping(...)` | `GET /index/_mapping` | Read the installed mapping | Inspect schema metadata |
| `client.indices.putAlias(...)` | `PUT /index/_alias/name` | Add one alias association | Create a stable logical name |
| `client.indices.getAlias(...)` | `GET /_alias/name` | Inspect alias targets | Inspect a synonym/view name |
| `client.indices.updateAliases(...)` | `POST /_aliases` | Atomically apply alias actions | Atomic metadata/routing change |

`indices` is a namespace for index-level administration. Document and search
operations such as `index`, `get`, and `search` are methods directly on the
client.

## Index one document

```ts
const response = await client.index({
  index: "tickets",
  id: "ticket-1",
  body: {
    customerId: "customer-123",
    title: "Payment service unavailable",
    status: "open",
  },
});

console.log(response.body._id);
console.log(response.body.result); // "created" or "updated"
```

- `index` is the physical index or alias used for the request.
- `id` becomes document metadata (`_id`); it is not added to `_source`.
- `body` becomes `_source` if the mapping accepts it.
- Reusing the same index and ID replaces the stored document rather than
  adding a second copy.

For bulk fixture loading, the client also provides `client.bulk(...)`. This lab
currently demonstrates the Bulk API with NDJSON and `curl`, keeping its paired
action/document line format visible.

## Refresh after test writes

```ts
await client.indices.refresh({ index: "tickets" });
```

An acknowledged index operation is not necessarily visible to search
immediately. A refresh publishes recent changes to searchable segments. Tests
call it explicitly so the following assertion is deterministic.

A direct `get` by `_id` is real-time by default and usually does not need this
refresh. Search does. Avoid refreshing after every production write: frequent
refreshes create extra indexing work. Production code normally accepts the
configured refresh interval or uses a deliberate write option such as
`refresh: "wait_for"` only when read-after-write search behavior is required.

## Get by document ID

```ts
type Ticket = {
  customerId: string;
  title: string;
  status: string;
};

const response = await client.get({
  index: "tickets",
  id: "ticket-1",
});

const ticket = response.body._source as Ticket;
```

`get` addresses one `_id`; it does not execute query DSL. The type assertion
helps TypeScript understand subsequent code, but it does not validate the JSON
returned by OpenSearch. Runtime validation is a separate boundary decision.

## Search

```ts
const response = await client.search({
  index: "support-monitoring-v1",
  body: {
    size: 100,
    query: {
      bool: {
        filter: [
          { term: { serviceId: "service-42" } },
          { term: { "ticket.status": "overdue" } },
        ],
      },
    },
    sort: [{ "ticket.dueDate": "asc" }],
  },
});

const hits = response.body.hits.hits;
```

Common query choices in this repository:

| Query | Use |
| --- | --- |
| `term` | Exact value on a `keyword`, numeric, boolean, or date field |
| `match` | Analyzed full-text search on a `text` field |
| `range` | Numeric or date comparisons using `lt`, `lte`, `gt`, or `gte` |
| `bool.filter` | Combine exact conditions without relevance scoring |
| `nested` | Keep conditions correlated within the same nested array element |
| `exists` | Require that an indexed field has a value |

Important response fields:

```ts
response.body.hits.total       // Total-hit metadata
response.body.hits.hits        // Matching hit array
response.body.hits.hits[0]._id
response.body.hits.hits[0]._index
response.body.hits.hits[0]._source
response.body.aggregations     // Present when the request defines aggs
```

The client serializes the query object. Do not concatenate user input into raw
JSON strings. Mapping choices still determine whether the query has the
intended semantics: TypeScript cannot tell that `term` was aimed at a `text`
field or that a field name was conceptually wrong.

## Count

```ts
const response = await client.count({ index: "tickets" });
console.log(response.body.count);
```

With no query body, this counts every document in the addressed index or
alias. A `query` can be supplied in `body` to count only matching documents.

## Create and delete an index

```ts
await client.indices.create({
  index: indexName,
  body: {
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
    },
    mappings: {
      dynamic: "strict",
      properties: {
        status: { type: "keyword" },
        dueDate: { type: "date", format: "strict_date" },
      },
    },
  },
});

await client.indices.delete({ index: indexName });
```

Index creation is not idempotent: creating an existing name fails. Tests use a
UUID in `indexName` and delete exactly that index in `finally`. Never replace a
narrow test name with wildcard deletion against a shared cluster.

## Inspect a mapping

```ts
const response = await client.indices.getMapping({ index: indexName });
const installedMapping = response.body[indexName]?.mappings;
```

The response is keyed by physical index name, even when an operation elsewhere
uses an alias. Mapping assertions should target important contract fields
rather than snapshot every server-generated detail.

## Manage aliases atomically

Add an initial alias:

```ts
await client.indices.putAlias({
  index: legacyIndex,
  name: "tickets",
});
```

Switch it in one cluster-state update:

```ts
await client.indices.updateAliases({
  body: {
    actions: [
      {
        remove: {
          index: legacyIndex,
          alias: "tickets",
          must_exist: true,
        },
      },
      { add: { index: replacementIndex, alias: "tickets" } },
    ],
  },
});
```

Inspect its current target:

```ts
const response = await client.indices.getAlias({ name: "tickets" });
const physicalIndexes = Object.keys(response.body);
```

Putting the remove and add actions in one `updateAliases` call avoids an
interval in which the alias is missing or points at an unintended combination
of indexes.

## Reindex

```ts
const response = await client.reindex({
  refresh: true,
  wait_for_completion: true,
  body: {
    source: { index: legacyIndex },
    dest: { index: replacementIndex },
  },
});
```

Create the destination with its intended mapping before reindexing. Reindex
copies each document's `_source` and indexes it according to the destination
mapping; it does not change the source index.

Do not interpret "the request returned" as sufficient migration validation.
Inspect counts and the response's `failures` array before moving an alias. With
the pinned OpenSearch and client versions, some mapping failures return HTTP
400, causing the promise to reject while retaining structured diagnostics in
`error.meta.body`:

```ts
try {
  await client.reindex({ /* ... */ });
} catch (error) {
  const responseError = error as {
    meta?: {
      statusCode?: number;
      body?: { failures?: unknown[] };
    };
  };

  console.error(responseError.meta?.statusCode);
  console.error(responseError.meta?.body?.failures);
}
```

## Response and error pattern

Successful client calls in this repository expose the OpenSearch payload under
`response.body`:

```ts
const response = await client.search({ /* ... */ });
console.log(response.body);
console.log(response.statusCode);
```

Transport or HTTP failures reject the promise. Use `try`/`catch` where recovery
or diagnostics are meaningful, and use `finally` for cleanup:

```ts
let indexCreated = false;

try {
  await client.indices.create({ index: indexName, body: definition });
  indexCreated = true;
  // Exercise and assert behavior.
} finally {
  if (indexCreated) {
    await client.indices.delete({ index: indexName });
  }
}
```

This cleanup flag matters because deleting an index that was never created can
hide the original setup error with a second failure.
