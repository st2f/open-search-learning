import { describe, expect, test } from "vitest";
import { toOverdueTicket } from "../../src/find-overdue-tickets.ts";

describe("toOverdueTicket", () => {
  test("turns an OpenSearch hit into the application result", () => {
    const result = toOverdueTicket({
      _id: "monitoring-1",
      _source: {
        customerId: "customer-123",
        serviceId: "service-42",
        ticket: {
          type: "INCIDENT",
          dueDate: "2026-09-15",
          status: "overdue",
        },
        indicators: {
          openCount: 2,
          resolvedCount: 8,
        },
        updatedAt: "2026-09-01T18:00:00Z",
      },
    });

    expect(result).toEqual({
      id: "monitoring-1",
      customerId: "customer-123",
      serviceId: "service-42",
      type: "INCIDENT",
      dueDate: "2026-09-15",
      openCount: 2,
      updatedAt: "2026-09-01T18:00:00Z",
    });
  });

  test("rejects a hit without its stored source", () => {
    expect(() => toOverdueTicket({ _id: "monitoring-1" })).toThrow(
      "OpenSearch hit is missing _id or _source",
    );
  });
});
