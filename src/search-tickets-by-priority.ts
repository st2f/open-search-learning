import { Client } from "@opensearch-project/opensearch";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
  priority?: "low" | "normal" | "high";
};

type SearchHit<TDocument> = {
  _id?: string;
  _source?: TDocument;
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets-v1";
const ticketIds = ["ticket-5", "ticket-6"];

const tickets: Array<{ id: string; document: Ticket }> = [
  {
    id: "ticket-5",
    document: {
      customerId: "customer-202",
      title: "Older client cannot send priority",
      status: "open",
      dueDate: "2026-09-19",
      responseTimeMinutes: 25,
    },
  },
  {
    id: "ticket-6",
    document: {
      customerId: "customer-303",
      title: "Checkout outage requires urgent attention",
      status: "open",
      dueDate: "2026-09-20",
      responseTimeMinutes: 10,
      priority: "high",
    },
  },
];

try {
  for (const ticket of tickets) {
    await client.index({
      index: indexName,
      id: ticket.id,
      body: ticket.document,
    });
  }

  await client.indices.refresh({ index: indexName });

  const bothStyles = await client.search({
    index: indexName,
    body: {
      query: {
        ids: {
          values: ticketIds,
        },
      },
    },
  });

  console.log("\nBoth document styles:");
  const bothHits = bothStyles.body.hits.hits as SearchHit<Ticket>[];
  for (const hit of bothHits) {
    console.log(hit._id, hit._source?.title, hit._source?.priority);
  }

  const highPriorityTickets = await client.search({
    index: indexName,
    body: {
      query: {
        bool: {
          filter: [
            {
              ids: {
                values: ticketIds,
              },
            },
            {
              term: {
                priority: "high",
              },
            },
          ],
        },
      },
    },
  });

  console.log('\nDocuments with priority = "high":');
  const highPriorityHits = highPriorityTickets.body.hits
    .hits as SearchHit<Ticket>[];
  for (const hit of highPriorityHits) {
    console.log(hit._id, hit._source?.title, hit._source?.priority);
  }

  const documentsWithoutPriority = await client.search({
    index: indexName,
    body: {
      query: {
        bool: {
          filter: {
            ids: {
              values: ticketIds,
            },
          },
          must_not: {
            exists: {
              field: "priority",
            },
          },
        },
      },
    },
  });

  console.log("\nDocuments without an indexed priority value:");
  const withoutPriorityHits = documentsWithoutPriority.body.hits
    .hits as SearchHit<Ticket>[];
  for (const hit of withoutPriorityHits) {
    console.log(hit._id, hit._source?.title, hit._source?.priority);
  }
} finally {
  client.close();
}
