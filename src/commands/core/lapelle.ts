import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { getLapelle } from "../../utils/lapelle";
import { EsilvStructure } from "../../utils/esilv";
import { Command } from "../../@types/command";
import { LoopLapelleOptions } from "../..";

export const Lapelle: Command = {
  data: new SlashCommandBuilder()
    .setName("lapelle")
    .setDescription("Réponds avec le statut de l'appel du cours !"),
  async execute(interaction: CommandInteraction) {
    let options: LoopLapelleOptions | null = null;
    try {
      for (const diplome of EsilvStructure) {
        for (const year of diplome.years) {
          for (const formation of year.formations) {
            if (
              interaction.channelId ===
              process.env[`${diplome}_${year}_${formation}_CHANNEL`]
            ) {
              options = {
                diplome: diplome.value,
                year: year.value,
                formation: formation.value,
              };
            }
          }
        }
      }

      if (!options) {
        throw new Error("Ce salon n'est pas pris en charge !");
      }

      await interaction.deferReply();
      getLapelle(async ({ open, cours, message }) => {
        if (message.endsWith(".")) {
          // Retirer le dernier caractère (le point)
          message = message.slice(0, -1);
        }
        if (open) {
          await interaction.editReply(
            `L'appel est ouvert !\n${cours.presence}`
          );
        } else {
          await interaction.editReply(`${message} !`);
        }
      }, options);
    } catch (error: any) {
      interaction.reply(error.message);
    }
  },
};

export default Lapelle;
