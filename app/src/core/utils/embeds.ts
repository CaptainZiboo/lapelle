import { EmbedBuilder } from "discord.js";

interface SimpleEmbedOptions {
  title?: string;
  emoji?: string;
  content: string;
}

export const SimpleEmbed = ({ title, emoji, content }: SimpleEmbedOptions) => {
  const embed = new EmbedBuilder()
    .setColor("DarkButNotBlack")
    .setDescription(`${emoji ? `${emoji}\u00A0\u00A0\u00A0` : ""}${content}`)
    .setFooter({
      text: "Lapelle Devinci by CaptainZiboo",
    });

  !!title && embed.setTitle(title);

  return embed;
};
