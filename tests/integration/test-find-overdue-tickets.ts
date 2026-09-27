import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Client } from "@opensearch-project/opensearch";
import { expect } from "vitest";
import {
  findOverdueTickets,
  type SupportMonitoringDocument,
} from "../../src/find-overdue-tickets.ts";

const mappingFile = new URL(
  "../../mappings/support-monitoring-v1.json",
  import.meta.url,
);

export async function runFindOverdueTicketsScenario(
  client: Client,
): Promise<void> {
  const indexName = `support-monitoring-application-${randomUUID()}`;
  let indexCreated = false;

  const fixtures: Array<{
    id: string;
    document: SupportMonitoringDocument;
  }> = [
    {
      id: "monitoring-1",
      document: {
        customerId: "customer-123",
        serviceId: "service-42",
        ticket: {
          type: "INCIDENT",
          dueDate: "2026-09-15",
          status: "overdue",
        },
        indicators: { openCount: 2, resolvedCount: 8 },
        updatedAt: "2026-09-01T18:00:00Z",
      },
    },
    {
      id: "monitoring-2",
      document: {
        customerId: "customer-456",
        serviceId: "service-42",
        ticket: {
          type: "INCIDENT",
          dueDate: "2026-09-10",
          status: "resolved",
        },
        indicators: { openCount: 0, resolvedCount: 12 },
        updatedAt: "2026-09-03T11:15:00Z",
      },
    },
    {
      id: "monitoring-3",
      document: {
        customerId: "customer-789",
        serviceId: "service-43",
        ticket: {
          type: "PROBLEM",
          dueDate: "2026-09-08",
          status: "overdue",
        },
        indicators: { openCount: 1, resolvedCount: 4 },
        updatedAt: "2026-09-04T08:00:00Z",
      },
    },
    {
      id: "monitoring-4",
      document: {
        customerId: "customer-123",
        serviceId: "service-42",
        ticket: {
          type: "PROBLEM",
          dueDate: "2026-09-12",
          status: "overdue",
        },
        indicators: { openCount: 3, resolvedCount: 5 },
        updatedAt: "2026-09-04T14:45:00Z",
      },
    },
  ];

  try {
    const indexDefinition = JSON.parse(await readFile(mappingFile, "utf8"));
    await client.indices.create({
      index: indexName,
      body: indexDefinition,
    });
    indexCreated = true;

    for (const fixture of fixtures) {
      await client.index({
        index: indexName,
        id: fixture.id,
        body: fixture.document,
      });
    }
    await client.indices.refresh({ index: indexName });

    const result = await findOverdueTickets(
      client,
      indexName,
      "service-42",
    );

    expect(result).toEqual([
      {
        id: "monitoring-4",
        customerId: "customer-123",
        serviceId: "service-42",
        type: "PROBLEM",
        dueDate: "2026-09-12",
        openCount: 3,
        updatedAt: "2026-09-04T14:45:00Z",
      },
      {
        id: "monitoring-1",
        customerId: "customer-123",
        serviceId: "service-42",
        type: "INCIDENT",
        dueDate: "2026-09-15",
        openCount: 2,
        updatedAt: "2026-09-01T18:00:00Z",
      },
    ]);
  } finally {
    if (indexCreated) {
      await client.indices.delete({ index: indexName });
    }
  }
}
