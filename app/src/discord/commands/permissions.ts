import { CommandData, SlashCommandProps } from "commandkit";
import { PermissionsCommand } from "../../core/commands/permissions.command";

export const data: CommandData = {
  name: "permissions",
  description:
    "Gérer les roles/utilisateur autorisés à gérer les notifications du serveur",
};

export const run = async (args: SlashCommandProps) =>
  new PermissionsCommand(args).use();
