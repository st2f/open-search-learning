import { randomUUID } from "node:crypto";
import { type Client } from "@opensearch-project/opensearch";
import { expect } from "vitest";

type ReindexFailure = {
  cause?: {
    reason?: string;
    type?: string;
  };
  id?: string;
  index?: string;
  status?: number;
};

type ReindexResult = {
  created?: number;
  failures?: ReindexFailure[];
};

const settings = {
  index: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
} as const;

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

// This is deliberately wrong: response times such as 15 and 30 cannot be
// parsed as booleans. The real replacement mapping uses float.
const brokenReplacementMapping = {
  dynamic: "strict",
  properties: {
    customerId: { type: "keyword" },
    title: { type: "text" },
    status: { type: "keyword" },
    dueDate: { type: "date", format: "strict_date" },
    responseTimeMinutes: { type: "boolean" },
    priority: { type: "keyword" },
  },
} as const;

export async function runBrokenTicketMigrationScenario(
  client: Client,
): Promise<void> {
  const testRunId = randomUUID();
  const legacyIndex = `tickets-broken-legacy-${testRunId}`;
  const replacementIndex = `tickets-broken-new-${testRunId}`;
  const aliasName = `tickets-broken-${testRunId}`;
  const createdIndexes: string[] = [];

  try {
    await client.indices.create({
      index: legacyIndex,
      body: { settings, mappings: legacyMapping },
    });
    createdIndexes.push(legacyIndex);

    await client.index({
      index: legacyIndex,
      id: "ticket-1",
      body: {
        customerId: "customer-123",
        title: "Payment service unavailable",
        status: "open",
        dueDate: "2026-09-15",
        responseTimeMinutes: 30,
        priority: "critical",
      },
    });
    await client.index({
      index: legacyIndex,
      id: "ticket-2",
      body: {
        customerId: "customer-456",
        title: "Payment service restored",
        status: "closed",
        dueDate: "2026-09-12",
        responseTimeMinutes: 15,
        priority: "normal",
      },
    });
    await client.indices.refresh({ index: legacyIndex });
    await client.indices.putAlias({ index: legacyIndex, name: aliasName });

    await client.indices.create({
      index: replacementIndex,
      body: { settings, mappings: brokenReplacementMapping },
    });
    createdIndexes.push(replacementIndex);

    let reindexResult: ReindexResult | undefined;
    let reindexStatusCode: number | undefined;
    try {
      const response = await client.reindex({
        refresh: true,
        wait_for_completion: true,
        body: {
          source: { index: legacyIndex },
          dest: { index: replacementIndex },
        },
      });

      if ("failures" in response.body) {
        reindexResult = response.body;
      }
    } catch (error) {
      const responseError = error as {
        meta?: { body?: ReindexResult; statusCode?: number };
      };
      reindexResult = responseError.meta?.body;
      reindexStatusCode = responseError.meta?.statusCode;
    }

    const failures = reindexResult?.failures ?? [];

    // OpenSearch returns the diagnostic body with HTTP 400, which makes the
    // client reject its promise. A migration needs both the status and body.
    expect(reindexStatusCode).toBe(400);
    expect(failures).toHaveLength(2);
    expect(reindexResult?.created).toBe(0);
    expect(failures.map((failure) => failure.id).sort()).toEqual([
      "ticket-1",
      "ticket-2",
    ]);
    expect(failures[0]?.index).toBe(replacementIndex);
    expect(failures[0]?.status).toBe(400);
    expect(failures[0]?.cause?.type).toBe("mapper_parsing_exception");
    expect(failures[0]?.cause?.reason).toContain("responseTimeMinutes");

    // Only a completely successful copy is allowed to reach the alias switch.
    if (reindexStatusCode === undefined && failures.length === 0) {
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
    }

    const sourceDocument = await client.get({
      index: legacyIndex,
      id: "ticket-1",
    });
    expect(sourceDocument.body._source).toMatchObject({
      responseTimeMinutes: 30,
    });

    const destinationMapping = await client.indices.getMapping({
      index: replacementIndex,
    });
    expect(
      destinationMapping.body[replacementIndex]?.mappings.properties
        ?.responseTimeMinutes,
    ).toEqual({ type: "boolean" });

    const sourceCount = await client.count({ index: legacyIndex });
    const destinationCount = await client.count({ index: replacementIndex });
    expect(sourceCount.body.count).toBe(2);
    expect(destinationCount.body.count).toBe(0);

    const aliasResponse = await client.indices.getAlias({ name: aliasName });
    expect(Object.keys(aliasResponse.body)).toEqual([legacyIndex]);
  } finally {
    await Promise.all(
      createdIndexes.map((index) => client.indices.delete({ index })),
    );
  }
}
