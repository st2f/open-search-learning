import { randomUUID } from "node:crypto";
import { type Client } from "@opensearch-project/opensearch";
import { expect } from "vitest";

type LegacyTicket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
  priority: string;
};

type SearchHit<TDocument> = {
  _id?: string;
  _index?: string;
  _source?: TDocument;
};

const legacyMapping = {
  dynamic: "strict",
  properties: {
    customerId: { type: "keyword" },
    title: { type: "text" },
    status: { type: "keyword" },
    dueDate: { type: "date", format: "strict_date" },
    responseTimeMinutes: { type: "integer" },
    priority: { type: "keyword" },
  },
} as const;

const replacementMapping = {
  dynamic: "strict",
  properties: {
    customerId: { type: "keyword" },
    title: { type: "text" },
    status: { type: "keyword" },
    dueDate: { type: "date", format: "strict_date" },
    responseTimeMinutes: { type: "float" },
    priority: { type: "keyword" },
  },
} as const;

const indexSettings = {
  index: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
} as const;

export async function runTicketMigrationScenario(client: Client): Promise<void> {
  const testRunId = randomUUID();
  const legacyIndex = `tickets-migration-legacy-${testRunId}`;
  const replacementIndex = `tickets-migration-new-${testRunId}`;
  const aliasName = `tickets-migration-${testRunId}`;
  const createdIndexes: string[] = [];

  const tickets: Array<{ id: string; document: LegacyTicket }> = [
    {
      id: "ticket-1",
      document: {
        customerId: "customer-123",
        title: "Payment service unavailable",
        status: "open",
        dueDate: "2026-09-15",
        responseTimeMinutes: 30,
        priority: "critical",
      },
    },
    {
      id: "ticket-2",
      document: {
        customerId: "customer-456",
        title: "Payment service restored",
        status: "closed",
        dueDate: "2026-09-12",
        responseTimeMinutes: 15,
        priority: "normal",
      },
    },
  ];

  try {
    // Construct the state that existed before the migration was introduced.
    await client.indices.create({
      index: legacyIndex,
      body: {
        settings: indexSettings,
        mappings: legacyMapping,
      },
    });
    createdIndexes.push(legacyIndex);

    for (const ticket of tickets) {
      await client.index({
        index: legacyIndex,
        id: ticket.id,
        body: ticket.document,
      });
    }
    await client.indices.refresh({ index: legacyIndex });
    await client.indices.putAlias({ index: legacyIndex, name: aliasName });

    // Exercise the migration: prepare the destination, copy existing data,
    // then make the new physical index visible through the stable alias.
    await client.indices.create({
      index: replacementIndex,
      body: {
        settings: indexSettings,
        mappings: replacementMapping,
      },
    });
    createdIndexes.push(replacementIndex);

    const reindexResponse = await client.reindex({
      refresh: true,
      wait_for_completion: true,
      body: {
        source: { index: legacyIndex },
        dest: { index: replacementIndex },
      },
    });

    if (!("failures" in reindexResponse.body)) {
      throw new Error("Reindex unexpectedly returned an asynchronous task");
    }
    expect(reindexResponse.body.failures).toEqual([]);
    expect(reindexResponse.body.created).toBe(tickets.length);

    await client.indices.updateAliases({
      body: {
        actions: [
          {
            remove: {
              index: legacyIndex,
              alias: aliasName,
              must_exist: true,
            },
          },
          { add: { index: replacementIndex, alias: aliasName } },
        ],
      },
    });

    const mappingResponse = await client.indices.getMapping({
      index: replacementIndex,
    });
    expect(mappingResponse.body[replacementIndex]?.mappings).toEqual(
      replacementMapping,
    );

    const aliasResponse = await client.indices.getAlias({ name: aliasName });
    expect(Object.keys(aliasResponse.body)).toEqual([replacementIndex]);

    const searchResponse = await client.search({
      index: aliasName,
      body: {
        query: {
          bool: {
            must: { match: { title: "PAYMENT" } },
            filter: { term: { status: "open" } },
          },
        },
      },
    });

    const hits = searchResponse.body.hits.hits as SearchHit<LegacyTicket>[];
    expect(hits).toHaveLength(1);
    expect(hits[0]?._id).toBe("ticket-1");
    expect(hits[0]?._index).toBe(replacementIndex);
    expect(hits[0]?._source).toEqual(tickets[0]?.document);

    const legacyCount = await client.count({ index: legacyIndex });
    const replacementCount = await client.count({ index: replacementIndex });
    expect(legacyCount.body.count).toBe(tickets.length);
    expect(replacementCount.body.count).toBe(tickets.length);
  } finally {
    await Promise.all(
      createdIndexes.map((index) => client.indices.delete({ index })),
    );
  }
}
