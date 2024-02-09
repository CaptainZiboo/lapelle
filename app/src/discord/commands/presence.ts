import { CommandData, SlashCommandProps } from "commandkit";
import { PresenceCommand } from "../../core/commands/presence.command";

export const data: CommandData = {
  name: "lapelle",
  description: "Statut du relevé de présence de vos groupes",
};

export const run = async (args: SlashCommandProps) =>
  new PresenceCommand(args).use();
