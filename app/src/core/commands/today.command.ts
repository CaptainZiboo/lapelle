import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import { devinci } from "../../services/devinci";
import { SimpleEmbed } from "../utils/embeds";
import { CommandReplies } from "../utils/replies";
import { Course } from "../../services/portail";
import { getUnsyncedGroupsEmbed } from "./week.command";
import { PascalCase, whitespace } from "../utils/text";

export const getTodayEmbed = (courses: Course[]) => {
  return SimpleEmbed({
    title: "Emploi du temps",
    content: `Cours pour la journée du **${new Date().toLocaleDateString()}**`,
    emoji: "📅",
  }).setFields([
    {
      name: PascalCase(
        new Date().toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      ),
      value: courses
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
};

export const getEmptyTodayEmbed = () => {
  return SimpleEmbed({
    title: "Emploi du temps",
    content: "Aucun cours trouvé pour aujourd'hui",
    emoji: "📅",
  });
};

export class TodayCommand extends BaseCommand {
  async run({ interaction, client, handler }: SlashCommandProps) {
    await interaction.reply(
      CommandReplies.Waiting({
        message: "Récupération des cours d'aujourd'hui...",
        override: {
          ephemeral: true,
        },
      })
    );

    const { data: courses, meta } = await devinci.getUserTodayCourses(
      this.user
    );

    if (courses.length === 0) {
      await interaction.editReply({
        embeds: [getEmptyTodayEmbed()],
      });
    }

    await interaction.editReply({
      embeds: [getTodayEmbed(courses)],
    });

    if (meta?.unprocessed?.length) {
      await interaction.followUp({
        embeds: [getUnsyncedGroupsEmbed(meta.unprocessed)],
        ephemeral: true,
      });
    }
  }
}
