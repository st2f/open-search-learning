import { Client } from "@opensearch-project/opensearch";

type Ticket = {
  customerId: string;
  title: string;
  status: string;
  dueDate: string;
  responseTimeMinutes: number;
  priority?: "low" | "normal" | "high";
};

const client = new Client({ node: "http://localhost:9200" });
const indexName = "tickets";
const ticketId = "ticket-1";

try {
  const getResponse = await client.get({
    index: indexName,
    id: ticketId,
  });
  const ticket = getResponse.body._source as Ticket;

  console.log(`Requested index or alias: ${indexName}`);
  console.log(`Resolved physical index: ${getResponse.body._index}`);
  console.log("Retrieved _source:");
  console.log(ticket);
} finally {
  client.close();
}
