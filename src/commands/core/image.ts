import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import { Command } from "../../@types/command";
import path from "path";

export const Image: Command = {
  data: new SlashCommandBuilder()
    .setName("lapelleimage")
    .setDescription("Réponds avec l'image de Lapelle !"),
  async execute(interaction: CommandInteraction) {
    await interaction.reply({
      files: [path.join(__dirname, "../assets/shovel.png")],
    });
  },
};

export default Image;
