import { CommandData, SlashCommandProps } from "commandkit";
import path from "path";

export const data: CommandData = {
  name: "logo",
  description: "Réponds avec le logo de Lapelle !",
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await interaction.reply({
    files: [path.join(__dirname, "../../../assets/shovel.png")],
  });
}
