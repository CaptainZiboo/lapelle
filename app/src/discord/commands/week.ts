import { CommandData, SlashCommandProps } from "commandkit";
import { WeekCommand } from "../../core/commands/week.command";

export const data: CommandData = {
  name: "semaine",
  description: "Voir votre emploi du temps pour la semaine",
};

export const run = async (args: SlashCommandProps) =>
  new WeekCommand(args).use();
