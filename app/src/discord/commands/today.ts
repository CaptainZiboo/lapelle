import { CommandData, SlashCommandProps } from "commandkit";
import { TodayCommand } from "../../core/commands/today.command";

export const data: CommandData = {
  name: "aujourdhui",
  description: "Voir votre emploi du temps pour aujourd'hui",
};

export const run = async (args: SlashCommandProps) =>
  new TodayCommand(args).use();
