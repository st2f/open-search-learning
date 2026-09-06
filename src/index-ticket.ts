import { Client } from "@opensearch-project/opensearch";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets-v1";
const ticketId = "ticket-1";

const ticket: Ticket = {
  customerId: "customer-123",
  title: "Payment service unavailable",
  status: "open",
  dueDate: "2026-09-15",
  responseTimeMinutes: 30,
};

try {
  const indexResponse = await client.index({
    index: indexName,
    id: ticketId,
    body: ticket,
  });
  console.log(`Index result: ${indexResponse.body.result}`);

  const getResponse = await client.get({
    index: indexName,
    id: ticketId,
  });

  console.log("Retrieved _source:");
  console.log(getResponse.body._source);
} finally {
  client.close();
}
