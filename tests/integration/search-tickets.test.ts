import { randomUUID } from "node:crypto";
import { Client } from "@opensearch-project/opensearch";
import { expect, test } from "vitest";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
};

type SearchHit<TDocument> = {
  _id?: string;
  _source?: TDocument;
};

test("finds an open payment ticket using the installed mapping", async () => {
  const client = new Client({ node: "http://localhost:9200" });
  const indexName = `tickets-integration-${randomUUID()}`;
  let indexCreated = false;

  try {
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
            customerId: { type: "keyword" },
            title: { type: "text" },
            status: { type: "keyword" },
          },
        },
      },
    });
    indexCreated = true;

    const tickets: Array<{ id: string; document: Ticket }> = [
      {
        id: "ticket-1",
        document: {
          customerId: "customer-123",
          title: "Payment service unavailable",
          status: "open",
        },
      },
      {
        id: "ticket-2",
        document: {
          customerId: "customer-456",
          title: "Payment service restored",
          status: "closed",
        },
      },
      {
        id: "ticket-3",
        document: {
          customerId: "customer-789",
          title: "Password reset unavailable",
          status: "open",
        },
      },
    ];

    for (const ticket of tickets) {
      await client.index({
        index: indexName,
        id: ticket.id,
        body: ticket.document,
      });
    }
    await client.indices.refresh({ index: indexName });

    const response = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: {
              match: {
                title: "PAYMENT",
              },
            },
            filter: {
              term: {
                status: "open",
              },
            },
          },
        },
      },
    });

    const hits = response.body.hits.hits as SearchHit<Ticket>[];
    expect(hits).toHaveLength(1);
    expect(hits[0]?._id).toBe("ticket-1");
    expect(hits[0]?._source).toEqual(tickets[0]?.document);
  } finally {
    try {
      if (indexCreated) {
        await client.indices.delete({ index: indexName });
      }
    } finally {
      client.close();
    }
  }
});
