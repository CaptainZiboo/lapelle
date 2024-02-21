// Require the necessary discord.js classes
import { GatewayIntentBits, Client } from "discord.js";
import { db, db_client } from "./core/database";
import { CommandKit } from "commandkit";
import dotenv from "dotenv";
import { join } from "path";
import { CronJob } from "cron";
import { arrayContains, arrayOverlaps, eq } from "drizzle-orm";
import { notifications, users } from "./core/database/entities";
import { devinci } from "./services/devinci";
import {
  getEmptyWeekEmbed,
  getUnsyncedGroupsEmbed,
  getWeekEmbed,
} from "./core/commands/week.command";
import {
  getEmptyTodayEmbed,
  getTodayEmbed,
} from "./core/commands/today.command";
import { getPresenceEmbed } from "./core/commands/presence.command";
import cache from "./core/utils/cache";
import { logger } from "./core/utils/logger";
import { DiscordError } from "./core/utils/errors";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

new CommandKit({
  client,
  commandsPath: join(__dirname, "discord/commands"),
  eventsPath: join(__dirname, "discord/events"),
  devGuildIds: ["856443440371204116"],
  devUserIds: ["461334921915400192", "656050503171571723"],
  skipBuiltInValidations: true,
  bulkRegister: true,
});

async function start() {
  await db_client.connect();
  client.login(process.env.DISCORD_TOKEN);

  const presence = new CronJob("*/2 * * * *", async () => {
    const time = Date.now();
    let users_count = 0;
    let notifications_count = 0;
    logger.info("Sending presence notifications...");
    const presence_users = await db.query.users.findMany({
      where: arrayContains(users.notifications, ["presence"]),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    for (const user of presence_users) {
      try {
        if (user.groups.length > 0) {
          const cached = cache.notifications.get<number>(
            `${user._id}-presence`
          );

          if (cached && Date.now() < cached) {
            continue;
          }

          const { data: presence, meta } = await devinci.getGroupsPresence(
            user.groups.map(({ group }) => group.name)
          );

          if (!presence || presence.status !== "open") continue;

          const discord_user = await client.users.fetch(user.discord_id);
          await discord_user.send({
            embeds: [getPresenceEmbed(presence)],
          });

          users_count++;

          cache.notifications.set(
            `${user._id}-presence`,
            presence?.time.end.getTime()
          );
        }
      } catch (error: any) {
        logger.error("Error from presence cron");
        logger.error(error.stack);
        continue;
      }
    }

    const presence_notifications = await db.query.notifications.findMany({
      with: {
        group: true,
      },
    });

    for (const notification of presence_notifications) {
      try {
        const cached = cache.notifications.get<number>(
          `${notification._id}-presence`
        );

        if (cached && Date.now() < cached) {
          continue;
        }

        const { data: presence, meta } = await devinci.getGroupsPresence([
          notification.group.name,
        ]);

        if (!presence || presence.status !== "open") continue;

        const guild = client.guilds.cache.get(notification.guild_id);
        if (!guild) {
          logger.error(`Guild ${notification.guild_id} not found`);
        }
        const channel = guild?.channels.cache.get(notification.channel_id);
        if (!channel) {
          logger.error(`Channel ${notification.channel_id} not found`);
        }
        const roles = guild?.roles.cache.filter((role) =>
          notification.role_ids.includes(role.id)
        );
        if (!roles) {
          logger.error(`Roles ${notification.role_ids} not found`);
        }

        if (!channel || !channel.isTextBased()) {
          await db
            .delete(notifications)
            .where(eq(notifications._id, notification._id))
            .execute();
          continue;
        }

        await channel.send({
          content: roles?.map((role) => `<@&${role.id}>`).join(""),
          embeds: [getPresenceEmbed(presence)],
        });

        notifications_count++;

        cache.notifications.set(
          `${notification._id}-presence`,
          presence?.time.end.getTime()
        );
      } catch (error: any) {
        logger.error("Error from presence cron");
        logger.error(error.stack);
        continue;
      }
    }

    if (users_count > 0 || notifications_count > 0) {
      logger.info(`Sent ${users_count} presence notifications to users`);
      logger.info(
        `Sent ${notifications_count} presence notifications to channels`
      );
      logger.info(`Presence notifications took ${Date.now() - time}ms`);
    } else {
      logger.info("No presence notifications sent");
    }
  });

  presence.start();

  const today = new CronJob("0 7 * * *", async () => {
    const today_users = await db.query.users.findMany({
      where: arrayOverlaps(users.notifications, ["today"]),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    for (const user of today_users) {
      try {
        if (user.groups.length > 0) {
          const { data: courses, meta } = await devinci.getGroupsTodayCourses(
            user.groups.map(({ group }) => group.name)
          );

          const discord_user = await client.users.fetch(user.discord_id);
          await discord_user.send({
            embeds: [courses ? getTodayEmbed(courses) : getEmptyTodayEmbed()],
          });

          if (meta?.unprocessed?.length) {
            await discord_user.send({
              embeds: [getUnsyncedGroupsEmbed(meta.unprocessed)],
            });
          }
        }
      } catch (error: any) {
        logger.error("Error from today cron");
        logger.error(error.stack);
        continue;
      }
    }
  });

  today.start();

  const week = new CronJob("0 19 * * 1", async () => {
    const week_users = await db.query.users.findMany({
      where: arrayOverlaps(users.notifications, ["week"]),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    for (const user of week_users) {
      try {
        if (user.groups.length > 0) {
          const { data: week, meta } = await devinci.getGroupsWeekCourses(
            user.groups.map(({ group }) => group.name)
          );

          const discord_user = await client.users.fetch(user.discord_id);
          await discord_user.send({
            embeds: [week ? getWeekEmbed(week) : getEmptyWeekEmbed()],
          });

          if (meta?.unprocessed?.length) {
            await discord_user.send({
              embeds: [getUnsyncedGroupsEmbed(meta.unprocessed)],
            });
          }
        }
      } catch (error: any) {
        logger.error("Error from week cron");
        logger.error(error.stack);
        continue;
      }
    }
  });

  week.start();
}

start();
