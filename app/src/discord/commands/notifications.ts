import { CommandData, SlashCommandProps } from "commandkit";
import { NotificationsCommand } from "../../core/commands/notifications.command";

export const data: CommandData = {
  name: "notifications",
  description: "Gérer les notifications de vos groupes/du serveur",
};

export const run = async (args: SlashCommandProps) =>
  new NotificationsCommand(args).use();
