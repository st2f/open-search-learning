import { Client } from "@opensearch-project/opensearch";
import { afterAll, beforeAll, describe, test } from "vitest";
import { assertSafeTestEndpoint } from "../support/opensearch-test-safety.ts";
import { runBrokenTicketMigrationScenario } from "./test-broken-ticket-migration.ts";
import { runFindOverdueTicketsScenario } from "./test-find-overdue-tickets.ts";
import { runTicketMigrationScenario } from "./test-ticket-migration.ts";
import { runTicketSearchScenario } from "./test-ticket-search.ts";

describe("OpenSearch integration scenarios using the local node", () => {
  let client: Client | undefined;

  beforeAll(() => {
    const endpoint =
      process.env.OPENSEARCH_TEST_URL ?? "http://localhost:9200";
    assertSafeTestEndpoint(endpoint, "local");
    client = new Client({ node: endpoint });
  });

  afterAll(() => {
    client?.close();
  });

  test("installs the ticket mapping and finds an open payment ticket", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runTicketSearchScenario(client);
  });

  test("migrates existing legacy tickets", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runTicketMigrationScenario(client);
  });

  test("diagnoses a broken migration", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runBrokenTicketMigrationScenario(client);
  });

  test("finds overdue tickets through application code", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runFindOverdueTicketsScenario(client);
  });
});
