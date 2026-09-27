import { Client } from "@opensearch-project/opensearch";
import {
  OpenSearchContainer,
  type StartedOpenSearchContainer,
} from "@testcontainers/opensearch";
import { afterAll, beforeAll, describe, test } from "vitest";
import { assertSafeTestEndpoint } from "../support/opensearch-test-safety.ts";
import { runBrokenTicketMigrationScenario } from "./test-broken-ticket-migration.ts";
import { runFindOverdueTicketsScenario } from "./test-find-overdue-tickets.ts";
import { runTicketMigrationScenario } from "./test-ticket-migration.ts";
import { runTicketSearchScenario } from "./test-ticket-search.ts";

describe("OpenSearch integration scenarios with Testcontainers", () => {
  let container: StartedOpenSearchContainer | undefined;
  let client: Client | undefined;

  beforeAll(async () => {
    container = await new OpenSearchContainer(
      "opensearchproject/opensearch:3.8.0",
    )
      .withSecurityEnabled(false)
      .withEnvironment({
        OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx512m",
      })
      .start();

    const endpoint = container.getHttpUrl();
    assertSafeTestEndpoint(endpoint, "testcontainers");
    client = new Client({ node: endpoint });
  }, 130_000);

  afterAll(async () => {
    client?.close();
    await container?.stop();
  });

  test("installs the ticket mapping and finds an open payment ticket", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runTicketSearchScenario(client);
  });

  test("migrates existing legacy tickets and switches the alias", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runTicketMigrationScenario(client);
  });

  test("diagnoses a broken migration without switching the alias", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runBrokenTicketMigrationScenario(client);
  });

  test("finds overdue tickets for one service through application code", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runFindOverdueTicketsScenario(client);
  });
});
