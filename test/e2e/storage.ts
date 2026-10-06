import { createIdentityFixture } from "@/lib/identity/fixtures";

interface EventRow {
  advertiser_organization_id: string;
  event_name: string;
  spid: string;
  url: string;
}

export const storage = {
  events: [] as EventRow[],
  failingTable: "",
  identity: createIdentityFixture(),
  redisUnavailable: false,
  writes: [] as string[],
};

export async function insert(request: { table: string; values: unknown[] }) {
  storage.writes.push(request.table);
  if (request.table === storage.failingTable) {
    throw new Error("Test storage unavailable");
  }
  if (request.table === "default.advertiser_events") {
    storage.events.push(...(request.values as EventRow[]));
    return;
  }
  if (request.table !== "spids" && request.table !== "spid_replacements") {
    throw new Error(`Unexpected test insert: ${request.table}`);
  }
  await storage.identity.insert(request);
}
