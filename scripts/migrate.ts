/**
 * migrate.ts — Run database migrations against PostgreSQL
 *
 * Usage: pnpm db:migrate:run
 * Requires: DATABASE_URL environment variable (or .env file)
 */

import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

function loadEnv() {
  try {
    const envContent = readFileSync(".env", "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file not found, rely on environment variables
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required. Set it in .env or as an environment variable.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("railway.app") ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  // Find and sort migration files
  const migrationsDir = join(import.meta.dirname, "..", "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration(s)`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`Running ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file} applied`);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      // Skip "already exists" errors for idempotent migrations
      if (msg.includes("already exists")) {
        console.log(`  ⊘ ${file} already applied (skipped)`);
      } else {
        throw e;
      }
    }
  }

  console.log("\nMigration complete!");
}

run()
  .catch((e) => {
    console.error("Migration failed:", (e as Error).message);
    process.exit(1);
  })
  .finally(() => pool.end());
