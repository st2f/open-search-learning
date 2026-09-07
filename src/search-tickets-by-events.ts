import { Client } from "@opensearch-project/opensearch";

type Event = {
  type: string;
  actorId: string;
};

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
  events: Event[];
};

type SearchHit<TDocument> = {
  _id?: string;
  _source?: TDocument;
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets-v3";

const tickets: Array<{ id: string; document: Ticket }> = [
  {
    id: "ticket-1",
    document: {
      customerId: "customer-123",
      title: "Payment service unavailable",
      status: "open",
      dueDate: "2026-09-15",
      responseTimeMinutes: 30,
      events: [
        { type: "ASSIGNED", actorId: "agent-7" },
        { type: "RESOLVED", actorId: "agent-9" },
      ],
    },
  },
  {
    id: "ticket-2",
    document: {
      customerId: "customer-456",
      title: "Payment service slow",
      status: "investigating",
      dueDate: "2026-09-16",
      responseTimeMinutes: 45,
      events: [{ type: "ASSIGNED", actorId: "agent-9" }],
    },
  },
  {
    id: "ticket-3",
    document: {
      customerId: "customer-789",
      title: "Customer cannot reset password",
      status: "open",
      dueDate: "2026-09-17",
      responseTimeMinutes: 20,
      events: [{ type: "CREATED", actorId: "agent-9" }],
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

  const matchingTickets = await client.search({
    index: indexName,
    body: {
      query: {
        bool: {
          filter: [
            {
              term: {
                "events.type": "ASSIGNED",
              },
            },
            {
              term: {
                "events.actorId": "agent-9",
              },
            },
          ],
        },
      },
    },
  });

  console.log(
    "\nTickets for events.type = ASSIGNED AND events.actorId = agent-9",
  );
  const hits = matchingTickets.body.hits.hits as SearchHit<Ticket>[];
  for (const hit of hits) {
    console.log(hit._id, hit._source?.title, hit._source?.events);
  }
} finally {
  client.close();
}
