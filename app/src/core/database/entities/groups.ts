import { relations } from "drizzle-orm";
import { boolean, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { usersToGroups } from "./users.groups";
import { notifications } from "./notifications";

export const groups = pgTable(
  "groups",
  {
    _id: serial("_id").primaryKey(),
    name: text("name").notNull(),
    verified: boolean("verified").default(false),
  },
  (table) => ({
    u: unique().on(table.name),
  })
);

export const groupRelations = relations(groups, ({ one, many }) => ({
  users: many(usersToGroups),
  notifications: many(notifications),
}));

export type Group = typeof groups.$inferSelect;
export type GroupInsert = typeof groups.$inferInsert;
