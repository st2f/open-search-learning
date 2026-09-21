import { Client } from "@opensearch-project/opensearch";
import { test } from "vitest";
import { runTicketMigrationScenario } from "./test-ticket-migration.ts";
import { runTicketSearchScenario } from "./test-ticket-search.ts";

test("installs the ticket mapping and finds an open payment ticket using local OpenSearch", async () => {
  const client = new Client({ node: "http://localhost:9200" });

  try {
    await runTicketSearchScenario(client);
  } finally {
    client.close();
  }
});

test("migrates existing legacy tickets using local OpenSearch", async () => {
  const client = new Client({ node: "http://localhost:9200" });

  try {
    await runTicketMigrationScenario(client);
  } finally {
    client.close();
  }
});
