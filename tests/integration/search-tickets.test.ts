import { Client } from "@opensearch-project/opensearch";
import {
  OpenSearchContainer,
  type StartedOpenSearchContainer,
} from "@testcontainers/opensearch";
import { afterAll, beforeAll, describe, test } from "vitest";
import { runTicketSearchScenario } from "./test-ticket-search.ts";

describe("ticket search with Testcontainers", () => {
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

    client = new Client({ node: container.getHttpUrl() });
  }, 130_000);

  afterAll(async () => {
    client?.close();
    await container?.stop();
  });

  test("finds an open payment ticket", async () => {
    if (!client) {
      throw new Error("OpenSearch client was not initialized");
    }

    await runTicketSearchScenario(client);
  });
});
