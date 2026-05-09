import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let cachedDb: ReturnType<typeof drizzle> | null = null;

/**
 * Get a Drizzle instance bound to DATABASE_URL.
 * Cached per-process — call once at boot, reuse the result.
 */
export function getDb() {
  if (cachedDb) return cachedDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const client = postgres(url, { prepare: false });
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export type Db = ReturnType<typeof getDb>;
