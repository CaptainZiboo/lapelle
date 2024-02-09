import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { relations } from "drizzle-orm";

export const notifications = pgTable("notifications", {
  _id: serial("_id").primaryKey(),
  guild_id: varchar("guild_id").notNull(),
  channel_id: varchar("channel_id").notNull(),
  role_ids: text("role_ids").array().notNull(),
  group_id: serial("group_id").notNull(),
});

export const notificationRelations = relations(notifications, ({ one }) => ({
  group: one(groups, {
    fields: [notifications.group_id],
    references: [groups._id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
