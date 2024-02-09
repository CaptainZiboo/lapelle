import { pgTable, serial, text, unique, varchar } from "drizzle-orm/pg-core";

export const permissions = pgTable(
  "permissions",
  {
    _id: serial("_id").primaryKey(),
    role_ids: text("role_ids").array().notNull(),
    user_ids: text("user_ids").array().notNull(),
    guild_id: varchar("guild_id").notNull(),
  },
  (table) => ({
    u: unique().on(table.guild_id),
  })
);

export type Permission = typeof permissions.$inferSelect;
export type PermissionInsert = typeof permissions.$inferInsert;
