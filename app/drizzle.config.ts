import type { Config } from "drizzle-kit";
import { config as env } from "dotenv";

env({
  path: "../.env",
});

const { POSTGRES_URL } = process.env;

if (!POSTGRES_URL) throw new Error("Missing database URL in .env file");

const config: Config = {
  schema: "./src/core/database/entities/index.ts",
  out: "./src/core/database/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: POSTGRES_URL,
  },
};

export default config;
