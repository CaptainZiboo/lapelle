import { ApplicationCommandType } from "discord.js";
import { CommandData, SlashCommandProps } from "commandkit";
import { GroupsCommand } from "../../core/commands/groups.command";

export const data: CommandData = {
  name: "groupes",
  description: "Gérer vos groupes (rejoindre, importer, quitter, voir)",
  type: ApplicationCommandType.ChatInput,
};

export const run = (args: SlashCommandProps) => new GroupsCommand(args).use();
