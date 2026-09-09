import { Client } from "@opensearch-project/opensearch";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
  service: {
    id: string;
    name: string;
  };
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets-with-service";

const tickets: Array<{ id: string; document: Ticket }> = [
  {
    id: "ticket-1",
    document: {
      customerId: "customer-123",
      title: "Payment service unavailable",
      status: "open",
      dueDate: "2026-09-15",
      responseTimeMinutes: 30,
      service: {
        id: "service-42",
        name: "Payments API",
      },
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
      service: {
        id: "service-42",
        name: "Payments API",
      },
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
      service: {
        id: "service-7",
        name: "Identity API",
      },
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

  const paymentsTickets = await client.search({
    index: indexName,
    body: {
      query: {
        bool: {
          filter: {
            term: {
              "service.id": "service-42",
            },
          },
        },
      },
    },
  });

  console.log('\nTickets for service.id "service-42":');
  for (const hit of paymentsTickets.body.hits.hits) {
    console.log(hit._source?.title, `(${hit._source?.service.name})`);
  }
} finally {
  client.close();
}
