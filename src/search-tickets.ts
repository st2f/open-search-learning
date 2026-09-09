import { Client } from "@opensearch-project/opensearch";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets-legacy";

const tickets: Array<{ id: string; document: Ticket }> = [
  {
    id: "ticket-1",
    document: {
      customerId: "customer-123",
      title: "Payment service unavailable",
      status: "open",
      dueDate: "2026-09-15",
      responseTimeMinutes: 30,
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
    },
  },
  {
    id: "ticket-4",
    document: {
      customerId: "customer-101",
      title: "Invoice export unavailable",
      status: "closed",
      dueDate: "2026-09-18",
      responseTimeMinutes: 60,
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

  const titleMatches = await client.search({
    index: indexName,
    body: {
      query: {
        match: {
          title: "PAYMENT",
        },
      },
    },
  });

  console.log('\n1. match query on title: "PAYMENT"');
  for (const hit of titleMatches.body.hits.hits) {
    console.log(hit._source?.title);
  }

  const openTickets = await client.search({
    index: indexName,
    body: {
      query: {
        bool: {
          filter: {
            term: {
              status: "open",
            },
          },
        },
      },
    },
  });

  console.log('\n2. term filter on status: "open"');
  for (const hit of openTickets.body.hits.hits) {
    console.log(hit._source?.title, `(${hit._source?.status})`);
  }

  const inappropriateTitleMatches = await client.search({
    index: indexName,
    body: {
      query: {
        term: {
          title: "Payment",
        },
      },
    },
  });

  console.log('\n3. inappropriate term query on title: "Payment"');
  console.log(`matches=${inappropriateTitleMatches.body.hits.hits.length}`);
} finally {
  client.close();
}
