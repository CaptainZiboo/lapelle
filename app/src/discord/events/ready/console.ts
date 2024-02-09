import { Client, Events } from "discord.js";
import { CommandKit } from "commandkit";
import { logger } from "../../../core/utils/logger";

export default async (
  c: Client<true>,
  client: Client<true>,
  handler: CommandKit
) => {
  logger.info(`Logged in as ${client.user?.tag}!`);
  client.user?.setActivity("surveiller les groupes !");
};
