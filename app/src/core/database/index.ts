import { drizzle } from "drizzle-orm/node-postgres";
import * as entities from "./entities";
import { Client } from "pg";
import "dotenv/config";

const { POSTGRES_URL } = process.env;

if (!POSTGRES_URL) throw new Error("Missing database URL in .env file");

export const db_client = new Client({
  connectionString: POSTGRES_URL,
});

export const db = drizzle(db_client, {
  schema: entities,
});
