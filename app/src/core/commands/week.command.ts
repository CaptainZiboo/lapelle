import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import { devinci } from "../../services/devinci";
import { SimpleEmbed } from "../utils/embeds";
import { CommandReplies } from "../utils/replies";
import { InteractionResponse, RepliableInteraction } from "discord.js";
import { Week } from "../../services/portail";
import { PascalCase, whitespace } from "../utils/text";

export const getWeekEmbed = (week: Week) => {
  const embed = SimpleEmbed({
    title: "Emploi du temps",
    content: `Cours pour la semaine du **${week.meta.start.toLocaleDateString()}** au **${week.meta.end.toLocaleDateString()}**`,
    emoji: "📅",
  });

  for (const day of week.days) {
    if (day.courses.length)
      embed.addFields([
        {
          name: PascalCase(
            day.meta.date.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })
          ),
          value: day.courses
            .map((c) => {
              return `🧪${whitespace}${c.subject}\n👥${whitespace}${
                c.teachers
              }\n🕔${whitespace}${c.time.beginning.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })} - ${c.time.end.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}\n🚪${whitespace}${c.rooms} - ${c.campus} ${
                c.zoom ? `\n🎦${whitespace}[Lien Zoom](${c.zoom})` : ""
              }`;
            })
            .join("\n\n"),
        },
      ]);
  }

  return embed;
};

export const getEmptyWeekEmbed = () => {
  const embed = SimpleEmbed({
    title: "Emploi du temps",
    content: "Aucun cours trouvé pour cette semaine",
    emoji: "📅",
  });

  return embed;
};

export const getUnsyncedGroupsEmbed = (groupNames: string[]) => {
  const embed = SimpleEmbed({
    content: "Certains groupes n'ont pas pu être traités...",
    emoji: "⚠️",
  }).setFields([
    {
      name: "Groupes concernés :",
      value: groupNames.join("\n"),
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
  ]);

  return embed;
};

export class WeekCommand extends BaseCommand {
  async show(
    interaction: RepliableInteraction
  ): Promise<InteractionResponse | undefined> {
    return;
  }

  async run({ interaction, client, handler }: SlashCommandProps) {
    await interaction.reply(
      CommandReplies.Waiting({
        message: "Récupération des cours de la semaine...",
        override: {
          ephemeral: true,
        },
      })
    );

    const { data: week, meta } = await devinci.getUserWeekCourses(this.user);

    if (!week) {
      await interaction.editReply({
        embeds: [getEmptyWeekEmbed()],
      });
    } else {
      await interaction.editReply({
        embeds: [getWeekEmbed(week)],
      });
    }

    if (meta?.unprocessed?.length) {
      await interaction.followUp({
        embeds: [getUnsyncedGroupsEmbed(meta.unprocessed)],
        ephemeral: true,
      });
    }
  }
}
