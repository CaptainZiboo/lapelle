import { CommandData, SlashCommandProps } from "commandkit";
import { CredentialsCommand } from "../../core/commands/credentials.command";
import { ApplicationCommandType } from "discord.js";

export const data: CommandData = {
  name: "identifiants",
  description: "Ajouter/retirer vos identifiants du portail devinci",
  type: ApplicationCommandType.ChatInput,
};

export const run = (args: SlashCommandProps) =>
  new CredentialsCommand(args).use();
