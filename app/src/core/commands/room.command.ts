import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import { CommandReplies } from "../utils/replies";
import { devinci } from "../../services/devinci";
import { SimpleEmbed } from "../utils/embeds";
import { eq } from "drizzle-orm";
import { users } from "../database/entities";
import { db } from "../database";

export class RoomCommand extends BaseCommand {
  async run({ interaction, client, handler }: SlashCommandProps) {
    await interaction.reply(
      CommandReplies.Waiting({
        message: "Récupération de votre prochain cours...",
        override: {
          ephemeral: true,
        },
      })
    );

    const me = await db.query.users.findFirst({
      where: eq(users._id, this.user._id),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    const { data: course, meta } = await devinci.getGroupsNextCourse(
      me!.groups.map(({ group }) => group.name)
    );

    /* const { data: course, meta } = await devinci.getUserNextCourse(this.user); */

    if (!course) {
      await interaction.editReply(
        CommandReplies.Error({
          message: "Aucun cours trouvé",
        })
      );
      return;
    }

    await interaction.editReply({
      embeds: [
        SimpleEmbed({
          content: `Salle de votre prochain cours: **${course.rooms.join(
            ", "
          )}**`,
        }),
      ],
    });
  }
}
