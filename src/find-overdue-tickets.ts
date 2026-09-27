import { type Client } from "@opensearch-project/opensearch";

export type SupportMonitoringDocument = {
  customerId: string;
  serviceId: string;
  ticket: {
    type: string;
    dueDate: string;
    status: string;
  };
  indicators: {
    openCount: number;
    resolvedCount: number;
  };
  updatedAt: string;
};

export type OverdueTicket = {
  id: string;
  customerId: string;
  serviceId: string;
  type: string;
  dueDate: string;
  openCount: number;
  updatedAt: string;
};

export type SupportMonitoringHit = {
  _id?: string;
  _source?: SupportMonitoringDocument;
};

export function toOverdueTicket(hit: SupportMonitoringHit): OverdueTicket {
  if (!hit._id || !hit._source) {
    throw new Error("OpenSearch hit is missing _id or _source");
  }

  return {
    id: hit._id,
    customerId: hit._source.customerId,
    serviceId: hit._source.serviceId,
    type: hit._source.ticket.type,
    dueDate: hit._source.ticket.dueDate,
    openCount: hit._source.indicators.openCount,
    updatedAt: hit._source.updatedAt,
  };
}

export async function findOverdueTickets(
  client: Client,
  indexName: string,
  serviceId: string,
): Promise<OverdueTicket[]> {
  const response = await client.search({
    index: indexName,
    body: {
      size: 100,
      query: {
        bool: {
          filter: [
            { term: { serviceId } },
            { term: { "ticket.status": "overdue" } },
          ],
        },
      },
      sort: [{ "ticket.dueDate": "asc" }],
    },
  });

  const hits = response.body.hits.hits as SupportMonitoringHit[];
  return hits.map(toOverdueTicket);
}
