import { CommandData, SlashCommandProps } from "commandkit";
import { RoomCommand } from "../../core/commands/room.command";

export const data: CommandData = {
  name: "salle",
  description: "Voir la salle de votre prochain cours",
};

export const run = async (args: SlashCommandProps) =>
  new RoomCommand(args).use();
