import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { relations } from "drizzle-orm";
import { groups } from "./groups";

export const usersToGroups = pgTable(
  "user_groups",
  {
    user_id: integer("user_id")
      .notNull()
      .references(() => users._id),
    group_id: integer("group_id")
      .notNull()
      .references(() => groups._id),
    verified: boolean("verified").default(false),
  },
  (table) => {
    return {
      u: unique().on(table.user_id, table.group_id),
    };
  }
);

export const usersToGroupsRelations = relations(usersToGroups, ({ one }) => ({
  user: one(users, {
    fields: [usersToGroups.user_id],
    references: [users._id],
  }),
  group: one(groups, {
    fields: [usersToGroups.group_id],
    references: [groups._id],
  }),
}));

export type UsersToGroups = typeof usersToGroups.$inferSelect;
export type UsersToGroupsInsert = typeof usersToGroups.$inferInsert;
