import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required. See .env.example for setup.",
    );
  }

  const pool = new Pool({ connectionString });
  _db = drizzle(pool, { schema });
  return _db;
}

export type Database = ReturnType<typeof getDb>;

export * from "./schema.js";
