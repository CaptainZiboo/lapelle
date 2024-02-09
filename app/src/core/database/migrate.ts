import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as migration } from "drizzle-orm/node-postgres/migrator";
import postgres from "pg";
import "dotenv/config";

const { POSTGRES_URL } = process.env;

if (!POSTGRES_URL) throw new Error("Missing database URL in .env file");

const { Pool } = postgres;

const pool = new Pool({
  connectionString: POSTGRES_URL,
});

const database = drizzle(pool);

export async function migrate() {
  console.log("Migrating...");
  await migration(database, {
    migrationsFolder: "./src/core/database/migrations",
  });
  console.log("Migration ended !");
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
