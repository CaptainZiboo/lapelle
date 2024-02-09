import { CommandData, SlashCommandProps } from "commandkit";
import { HelpCommand } from "../../core/commands/help.command";

export const data: CommandData = {
  name: "help",
  description: "Commandes disponibles pour l'application.",
};

export const run = async (args: SlashCommandProps) =>
  new HelpCommand(args).use();
