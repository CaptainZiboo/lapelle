import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const command = {
  data: new SlashCommandBuilder()
    .setName("lapelle")
    .setDescription("Réponds avec le statut de l'appel du cours !"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(
      "Eh, attendez un peu svp, je suis pas encore fini, je suis monté à l'envers"
    );
  },
};

export default command;
