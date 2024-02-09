import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import { devinci } from "../../services/devinci";
import { CommandReplies } from "../utils/replies";
import { InteractionResponse, RepliableInteraction } from "discord.js";
import { SimpleEmbed } from "../utils/embeds";
import { PresenceStatus } from "../../services/portail";
import { getEmptyTodayEmbed } from "./today.command";
import { join } from "path";

export const getPresenceEmbed = (presence: PresenceStatus) => {
  switch (presence.status) {
    case "open":
      return SimpleEmbed({
        title: "Relevé de présence",
        content: "L'appel est ouvert !",
        emoji: "✅",
      }).setURL(presence.url);

    case "closed":
      return SimpleEmbed({
        title: "Relevé de présence",
        content: "L'appel est fermé.",
        emoji: "❌",
      });
    case "not-started":
      return SimpleEmbed({
        title: "Relevé de présence",
        content: "L'appel n'a pas encore commencé.",
        emoji: "⏳",
      });
  }
};

export class PresenceCommand extends BaseCommand {
  async show(
    interaction: RepliableInteraction
  ): Promise<InteractionResponse | undefined> {
    return;
  }

  async run({ interaction, client, handler }: SlashCommandProps) {
    await interaction.reply(
      CommandReplies.Waiting({
        message: "Récupération des cours de la journée...",
        override: {
          ephemeral: true,
        },
      })
    );

    const { data: presence, meta } = await devinci.getUserPresence(this.user);

    if (!presence) {
      interaction.editReply({
        embeds: [getEmptyTodayEmbed()],
      });
      return;
    }

    if (presence) {
      await interaction.editReply({
        embeds: [getPresenceEmbed(presence)],
        files: [join(__dirname, "../../../assets/shovel.png")],
      });
    }

    if (meta?.unprocessed?.length) {
      await interaction.followUp({
        embeds: [
          SimpleEmbed({
            content: "Certains groupes n'ont pas pu être traités...",
            emoji: "⚠️",
          }).setFields([
            {
              name: "Groupes concernés :",
              value: meta.unprocessed.join("\n"),
            },
            {
              name: "Pourquoi ?",
              value:
                "Les groupes non traités sont les groupes pour lesquels aucun utilisateur / identifiant n'a été trouvé. Si vous pensez qu'il s'agit d'une erreur, veuillez contacter un administrateur.",
            },
            {
              name: "Que faire ?",
              value:
                "Si vous faites partie d'un de ces groupes et avez renseigné vos identifiants, synchronisez vos groupes avec le portail via la commande `/groupes`",
            },
          ]),
        ],
        ephemeral: true,
      });
    }
  }
}
