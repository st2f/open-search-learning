# OpenSearch Learning Plan

## Goal

Build a very small OpenSearch project incrementally to understand:

- OpenSearch documents and indexes
- mappings
- text versus keyword
- objects and nested data
- indexing and querying
- inspecting mappings and index state
- mapping evolution
- why some schema changes require a new index
- reindexing
- aliases
- index migration patterns
- integration testing with a real local OpenSearch instance
- Testcontainers
- safe test isolation and cleanup

The goal is not to build a search application.

The goal is to develop enough operational intuition to safely understand, test, and review OpenSearch changes in an existing application.

Keep each increment independently understandable.

Do not build ahead.

At each increment:

1. Explain what currently exists.
2. Explain what is changing.
3. Explain why.
4. Show the OpenSearch state before and after when relevant.
5. Ask me to inspect or run the result before proceeding.

## Constraints

- Use TypeScript and Node.js.
- Use the official OpenSearch JavaScript client.
- Use an official OpenSearch Docker image.
- Prefer explicit mappings over relying on dynamic mapping.
- Keep documents deliberately small.
- Do not build HTTP APIs, frontends, queues, Lambdas, Terraform, databases, authentication systems, or unrelated infrastructure.
- Do not introduce repository abstractions initially.
- Do not hide OpenSearch operations behind generic helper layers until I understand them.
- Prefer direct OpenSearch API/client calls so I can see what happens.
- Do not optimize for production scale.
- Do not introduce OpenSearch Dashboards unless an exercise specifically benefits from it.
- Pin the OpenSearch Docker image to a specific version rather than using latest.
- Keep local experiments disposable.
- Never connect this lab to any work or production OpenSearch cluster.
- Do not assume that starting from an empty index represents every real migration scenario.
- Explain differences from a relational database when useful, but do not force SQL analogies where they are misleading.

---

## Increment 1 — Run One Local OpenSearch Node

```text
Docker
  ↓
OpenSearch
```

Run a single OpenSearch node locally.

Security may be disabled for this local learning environment if that keeps the setup minimal.

Verify the cluster using a simple request.

Explain:

- what an OpenSearch cluster is
- what a node is
- what an index is
- what a document is
- `_source`
- document `_id`
- why an OpenSearch index is not simply equivalent to a SQL table

Do not write TypeScript yet.

Show me commands for inspecting:

- cluster health
- indexes
- an index mapping

At this point there should be no application-specific index.

---

## Increment 2 — Create an Index With an Explicit Mapping

Create an index named:

`tickets-legacy`

Use an explicit mapping for a deliberately small document such as:

```json
{
  "customerId": "customer-123",
  "title": "Payment service unavailable",
  "status": "open",
  "dueDate": "2026-09-15",
  "responseTimeMinutes": 30
}
```

Choose appropriate field types.

Explain each chosen type.

Pay particular attention to:

`customerId`, `title`, `status`, `dueDate`, and `responseTimeMinutes`.

Explain:

- mapping
- field type
- explicit mapping
- dynamic mapping
- why accidental dynamic mappings can create long-term problems
- what mapping information is determined when data is first indexed

Inspect the resulting mapping using OpenSearch.

Do not index a document yet.

---

## Increment 3 — Index and Retrieve Documents From TypeScript

Install only the required OpenSearch JavaScript client dependency.

Create a very small TypeScript script that:

1. Connects to local OpenSearch.
2. Indexes one support-ticket document.
3. Retrieves it by `_id`.
4. Prints `_source`.

```text
TypeScript
  ↓
OpenSearch client
  ↓
tickets-legacy
```

Explain:

- indexing a document
- `_id`
- `_source`
- create/index/update semantics at a basic level
- when the indexed document becomes searchable
- refresh behavior at a conceptual level

Keep the code explicit.

Do not introduce a repository class.

---

## Increment 4 — Learn `text` Versus `keyword`

Add several documents with titles and statuses.

Perform queries demonstrating the difference between:

`title` and `status`.

Use:

- a full-text query against title
- an exact-match query against status
- an intentionally inappropriate query so I can observe the difference

Explain carefully:

- text
- analysis
- tokens
- keyword
- exact values
- filtering versus full-text search

Inspect the mapping again.

If useful, demonstrate a multi-field such as:

`title` and `title.keyword`.

but only after explaining why it exists.

The goal is for me to predict which query will match before running it.

---

## Increment 5 — Add Object Data

Extend the documents with a simple service object:

```json
{
  "service": {
    "id": "service-42",
    "name": "Payments API"
  }
}
```

Create a new disposable index if needed rather than mutating the exercise blindly.

Explain:

- object fields
- dot notation
- how object properties appear in mappings
- how JSON structure and indexed field representation differ

Query documents using:

`service.id`

Do not introduce nested yet.

---

## Increment 6 — Understand `object` Versus `nested`

Create documents containing an event history such as:

```json
{
  "events": [
    {
      "type": "ASSIGNED",
      "actorId": "agent-7"
    },
    {
      "type": "RESOLVED",
      "actorId": "agent-9"
    }
  ]
}
```

First map it as a normal object array.

Construct a query that demonstrates the cross-object matching problem.

For example, make it possible for a query to accidentally appear to match:

```text
type = ASSIGNED
AND
actorId = agent-9
```

even though those values belong to different array elements.

The same issue can be explored with arrays of assignees, where properties such as team and role must remain associated with the same assignee.

Then create another index using a nested mapping and repeat the query correctly.

Explain:

- object flattening
- why arrays of objects can be surprising
- nested
- nested query
- tradeoffs of nested fields

This increment is particularly important.

Do not proceed until I can explain why nested exists.

---

## Increment 7 — Inspect Existing State Before Changing It

Before making any schema change, practice inspection.

Given `tickets-legacy`, inspect:

- mapping
- settings
- document count
- sample documents

Create a small checklist in the README:

### Before changing an OpenSearch index

1. What index exists?
2. What mapping does it currently have?
3. What data is already indexed?
4. Which applications read from it?
5. Which applications write to it?
6. Is the proposed change compatible with the existing mapping?

Explain why OpenSearch migrations should not automatically be approached as:

```text
start empty database
→ run schema migration
→ done
```

Compare this carefully with typical relational database migration intuition.

Do not make a schema change yet.

---

## Increment 8 — Make a Compatible Mapping Change

Add a new field to the existing mapping, such as:

`priority`

without replacing the index.

Inspect the mapping before and after.

Index:

- an older-style document without priority
- a newer document with priority

Query both.

Explain:

- why adding some new fields is compatible
- what happens to existing documents
- absence of a field versus a SQL NULL
- why mapping evolution is not identical to adding a SQL column

Do not reindex yet.

---

## Increment 9 — Attempt an Incompatible Mapping Change

Suppose `responseTimeMinutes` is currently mapped as a numeric type.

Suppose fractional response times are now required. Attempt to change it to:

`float`

Do this intentionally and observe OpenSearch reject it.

Do not work around the failure immediately.

Explain:

- why the mapping cannot simply be changed
- why already-indexed data matters
- why this differs from some relational schema migrations

Record the actual failure in the README in summarized form.

The goal is to encounter the constraint directly rather than merely reading about it.

---

## Increment 10 — Create the Replacement Index

Create `tickets-new` with the desired new mapping.

Do not delete `tickets-legacy`.

```text
tickets-legacy         tickets-new
existing documents     new mapping
                       initially empty
```

Inspect both indexes side by side.

Explain:

- physical index names
- role-based names in this lab versus versioned production names
- why keeping the old index temporarily is useful
- rollback possibilities

Do not copy data yet.

---

## Increment 11 — Reindex Legacy Into New

Use the OpenSearch Reindex API:

```text
tickets-legacy
  ↓
reindex
  ↓
tickets-new
```

Before reindexing:

- inspect document count in the legacy index
- inspect the new mapping
- confirm destination exists

Run the reindex.

Then verify:

- document count
- sample documents
- queries against the new index
- resulting field behavior

Explain:

- source index
- destination index
- why the destination mapping must be prepared first
- `_source` and its role in reindexing
- reindexing versus changing an index in place
- why reindexing could be expensive on large datasets

Do not delete the legacy index.

---

## Increment 12 — Introduce an Alias

Create an alias:

`tickets`

pointing to:

`tickets-legacy`

Change the TypeScript code so it uses:

`tickets`

rather than:

`tickets-legacy`

```text
Application
  ↓
tickets ← alias
  ↓
tickets-legacy ← physical index
```

Verify reads through the alias.

Explain:

- physical index
- alias
- why applications can use stable logical names
- how aliases help migrations

Do not switch it to the new index yet.

---

## Increment 13 — Perform an Alias-Based Migration

### Starting state

```text
Application
  ↓
tickets
  ↓
tickets-legacy

tickets-new (already populated)
```

Switch the alias so that it points from the legacy index to the new index.

Use the appropriate atomic alias update operation rather than separate unsafe remove/add steps.

Result:

```text
Application
  ↓
tickets
  ↓
tickets-new
```

Verify:

- the application code did not change
- queries now use the new index
- the legacy index still exists
- rollback is possible by changing the alias back

Then perform a rollback to the legacy index once, verify it, and switch to the
new index again.

Explain why alias switching can be safer than changing every caller to a new physical index name.

---

## Increment 14 — Understand Reads and Writes During Migration

Extend the alias experiment to consider writes.

Do not create a complex production migration.

Instead explain and demonstrate the issue:

```text
reindex starts
  ↓
application continues writing
  ↓
what happens to documents written during migration?
```

Experiment with writing one document after the initial reindex.

Observe whether it exists in the new index.

Introduce the concept of a write alias if useful.

Explain conceptually several migration strategies, without implementing all of them:

- stop writes briefly
- dual writes
- catch-up synchronization
- rebuild the target from a source of truth
- write alias strategies

Make clear that:

`reindex + alias switch`

does not automatically solve concurrent-write consistency.

This is one of the most important safety lessons in the lab.

---

## Increment 15 — Add a Basic Integration Test Against Local OpenSearch

Only now introduce automated integration testing.

Create a test that expects a real OpenSearch instance.

The test should:

1. Create a uniquely named test index.
2. Install an explicit mapping.
3. Index representative documents.
4. Execute a real query.
5. Assert the returned domain-relevant values.
6. Delete the test index afterward.

Do not use Testcontainers yet.

Explain:

- integration test versus unit test
- what this verifies that a mocked client cannot
- why explicit setup matters
- why tests should not depend on a developer’s existing indexes
- why unique/disposable index names matter

The test must own the state it creates.

---

## Increment 16 — Run OpenSearch With Testcontainers

Replace the requirement for a manually started OpenSearch process with a container started by the tests.

Use Testcontainers for Node.js.

Use an OpenSearch Docker image compatible with the application client.

If the Testcontainers library does not provide an OpenSearch-specific convenience class, use its generic container support rather than pretending Elasticsearch and OpenSearch are identical.

The test lifecycle becomes:

```text
test suite
  ↓
start OpenSearch container
  ↓
create test index
  ↓
install mapping
  ↓
index fixtures
  ↓
execute assertions
  ↓
delete index / dispose container
```

Explain:

- container lifecycle
- port mapping
- obtaining the actual mapped HTTP port
- startup readiness
- why hard-coding localhost:9200 is inappropriate when Testcontainers owns the container
- test isolation

Keep one OpenSearch container per test suite initially rather than one per test unless there is a good reason otherwise.

---

## Increment 17 — Test the Mapping, Not Just the Application Result

Add an integration test that retrieves the actual mapping and asserts a few critical properties.

For example:

```text
status → keyword
dueDate → date
events → nested
```

Do not snapshot the entire mapping blindly.

Assert only important contract fields.

Explain the tradeoff:

```text
behavior test
versus
mapping contract test
```

Discuss when asserting implementation details would make tests brittle and when mapping structure itself is part of the contract.

---

## Increment 18 — Test a Migration Against Existing Data

This is the most important integration-test exercise.

The test should NOT begin directly with the final index.

Instead:

1. Create the legacy index.
2. Install the old mapping.
3. Insert old-format representative data.
4. Execute the migration logic.
5. Create/configure the new index.
6. Reindex.
7. Switch alias.
8. Query through the alias.
9. Verify the resulting documents and behavior.

```text
Test fixture representing OLD STATE
  ↓
migration
  ↓
Test assertions representing EXPECTED NEW STATE
```

Explain why this differs from:

```text
create latest schema
→ insert fixtures
→ run query
```

The migration test should prove that realistic pre-existing state can become the expected new state.

---

## Increment 19 — Deliberately Break the Migration

Introduce one incompatible or incorrect assumption.

Possible examples:

- the legacy index contains a value incompatible with the new mapping
- a field is missing
- a field has an unexpected old representation
- nested/object structure differs
- alias points somewhere unexpected

Run the migration test and observe the failure.

Then inspect:

- source data
- destination mapping
- reindex response
- destination contents
- alias state

Explain what diagnostic information reveals the problem.

The purpose is to practice debugging a migration rather than merely proving the happy path.

---

## Increment 20 — Model a Support-Monitoring Document

Only after the generic mechanics are understood, create a more realistic but still invented document resembling a support-ticket and service-monitoring system.

For example:

```json
{
  "customerId": "customer-123",
  "serviceId": "service-42",
  "ticket": {
    "type": "INCIDENT",
    "dueDate": "2026-09-15",
    "status": "overdue"
  },
  "indicators": {
    "openCount": 2,
    "resolvedCount": 8
  },
  "updatedAt": "2026-09-01T18:00:00Z"
}
```

Do not copy proprietary work data or mappings.

Choose mappings deliberately.

Explain which fields are:

- identifiers
- filterable categorical values
- dates
- numeric indicators
- structured objects

Write a few domain-style queries:

- all overdue tickets for one customer
- tickets for one service
- tickets due before a date
- tickets with a particular status
- status aggregations/counts if appropriate

The goal is to connect OpenSearch concepts to a support-ticket and service-monitoring use case without recreating a production application.

---

## Increment 21 — Test Application Code Against OpenSearch

Introduce a small application function such as:

`findOverdueTickets(serviceId)`

The function may use the OpenSearch client directly or a very thin adapter.

Write:

```text
unit test
→ pure/domain transformation, if applicable

integration test
→ actual OpenSearch query
```

Explain what should be mocked and what should not.

Do not create an elaborate repository architecture.

The important distinction is:

```text
Does my TypeScript logic work?
versus
Does the mapping + indexed representation + real OpenSearch query work?
```

---

## Increment 22 — Safe Test Cleanup and Isolation

Run multiple integration tests.

Give each test suite or test a unique index namespace such as:

`test-tickets-<random-id>`

Practice cleanup even after assertion failures.

Explain:

- isolation
- deterministic fixtures
- avoiding shared developer state
- avoiding wildcard deletion against anything except a dedicated disposable test cluster
- why destructive cleanup commands are dangerous against shared clusters

Add an explicit safeguard so that tests refuse to run destructive setup/cleanup against a non-local/non-Testcontainers endpoint.

The exact safeguard can remain simple, but explain what risk it prevents.

---

## Increment 23 — Optional: Index Templates

Only after indexes and mappings are clear, introduce an index template.

Create a pattern such as:

`tickets-*`

and configure a simple mapping/settings template.

Create a new matching index and inspect what OpenSearch applies automatically.

Explain:

- index template
- index pattern
- mappings/settings supplied at index creation
- why templates affect newly created indexes rather than retroactively rewriting existing ones
- why templates can matter when applications create multiple versioned indexes

Keep this optional if it is not relevant to the current work codebase.

---

## Increment 24 — Final Migration Exercise

Start from:

`tickets-legacy`

with:

- explicit old mapping
- representative existing data
- alias `tickets`
- TypeScript application querying the alias

Target:

`tickets-new`

with one meaningful mapping change.

```text
Inspect existing state
  ↓
Create new mapping
  ↓
Reindex existing documents
  ↓
Validate new index
  ↓
Atomically switch alias
  ↓
Run application integration tests
  ↓
Keep legacy index available for rollback
```

Then answer, without looking at the implementation:

1. What can safely change in an existing mapping?
2. What kind of change usually requires another index?
3. Why do I inspect existing data before migrating?
4. What does reindex actually do?
5. What does an alias solve?
6. What does an alias NOT solve?
7. What happens to writes occurring during a migration?
8. Why can an OpenSearch migration test require old-state fixtures?
9. What does Testcontainers give me?
10. What should an integration test verify that a unit test cannot?
11. Why is a blank final-state index insufficient for some migration tests?
12. How would I debug a failed reindex or unexpected query result?

Do not introduce more advanced OpenSearch features until these answers are clear.

---

## Final Mental Model

Be able to explain this:

```text
Application
  ↓
logical alias
  ↓
physical index
  ↓
mapping determines indexed representation
  ↓
documents
```

And this migration:

```text
              existing data
                   ↓
             tickets-legacy
                   ↓
                 reindex
                   ↓
             tickets-new
                   ↑
             new mapping

Application
  ↓
tickets alias
  ↓
legacy before migration
new after atomic switch
```

And this integration test:

```text
Testcontainers
  ↓
Disposable OpenSearch
  ↓
OLD mapping + OLD representative data
  ↓
migration/reindex
  ↓
NEW index
  ↓
real query
  ↓
assert expected behavior
```

The most important increments are probably:

- 2 — explicit mappings
- 4 — text versus keyword
- 6 — object versus nested
- 7 — inspect existing state
- 9 — incompatible mapping changes
- 11 — reindex
- 12–14 — aliases and migration behavior
- 16 — Testcontainers
- 18 — migration testing against old state
- 19 — debugging failed migrations

The other increments make those concepts concrete rather than theoretical.

Increment 18 is particularly relevant: an integration test for a migration should often construct the old state, populate it, then exercise the transition. Creating an empty index with today’s mapping and checking that queries work would miss exactly the class of problem you caught manually.

Avoided using the Testcontainers Elasticsearch module automatically. Testcontainers for Node currently documents an Elasticsearch-specific module, while OpenSearch has its own official Docker images; using a generic container is the safer learning assumption unless the versions/APIs are deliberately verified compatible.

And the alias/reindex sequence in the plan corresponds to current OpenSearch behavior: the destination needs to exist/configured before reindexing, and alias updates can be atomic.
