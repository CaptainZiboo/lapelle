import { relations } from "drizzle-orm";
import { jsonb, pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { usersToGroups } from "./users.groups";

export const users = pgTable("users", {
  _id: serial("_id").primaryKey(),
  credentials: text("credentials"),
  discord_id: varchar("discord_id").notNull(),
  notifications: text("notifications").array().notNull(),
});

export const userRelations = relations(users, ({ one, many }) => ({
  groups: many(usersToGroups),
}));

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
