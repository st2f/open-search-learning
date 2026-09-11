import { Client } from "@opensearch-project/opensearch";
import { test } from "vitest";
import { runTicketSearchScenario } from "./test-ticket-search.ts";

test("finds an open payment ticket using local OpenSearch", async () => {
  const client = new Client({ node: "http://localhost:9200" });

  try {
    await runTicketSearchScenario(client);
  } finally {
    client.close();
  }
});
