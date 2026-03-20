import { getDb, agentQueries, queryAppearances } from "@mainstreetly/shared";

export interface QueryLogEntry {
  queryText: string;
  category?: string;
  location?: string;
  resultsCount: number;
  businessIds: string[];
  agentType?: string;
  responseTimeMs?: number;
}

export async function logQuery(entry: QueryLogEntry): Promise<void> {
  try {
    const db = getDb();

    // Insert into agent_queries
    const [inserted] = await db
      .insert(agentQueries)
      .values({
        queryText: entry.queryText,
        category: entry.category,
        location: entry.location,
        resultsCount: entry.resultsCount,
        businessesReturned: entry.businessIds,
        agentType: entry.agentType,
        responseTimeMs: entry.responseTimeMs,
      })
      .returning({ id: agentQueries.id });

    if (inserted) {
      // Insert one row per business into query_appearances
      if (entry.businessIds.length > 0) {
        await db.insert(queryAppearances).values(
          entry.businessIds.map((businessId) => ({
            queryId: inserted.id,
            businessId,
          })),
        );
      }
    }
  } catch (err) {
    // Don't let logging failures break the MCP response
    console.error("Failed to log query:", err);
  }
}
