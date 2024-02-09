import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as migration } from "drizzle-orm/node-postgres/migrator";
import postgres from "pg";
import "dotenv/config";
import { logger } from "../utils/logger";

const { POSTGRES_URL } = process.env;

if (!POSTGRES_URL) throw new Error("Missing database URL in .env file");

const { Pool } = postgres;

const pool = new Pool({
  connectionString: POSTGRES_URL,
});

const database = drizzle(pool);

export async function migrate() {
  logger.info("Migrating...");
  await migration(database, {
    migrationsFolder: "./src/core/database/migrations",
  });
  logger.info("Migration ended !");
  process.exit(0);
}

migrate().catch((err) => {
  logger.error(err);
  process.exit(1);
});
