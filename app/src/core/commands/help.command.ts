import { CommandData, SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import { SimpleEmbed } from "../utils/embeds";

import { data as CredentialsCommand } from "../../discord/commands/credentials";
import { data as NotificationsCommand } from "../../discord/commands/notifications";
import { data as RoomCommand } from "../../discord/commands/room";
import { data as PresenceCommand } from "../../discord/commands/presence";
import { data as WeekCommand } from "../../discord/commands/week";
import { data as PermissionsCommand } from "../../discord/commands/permissions";
import { data as GroupsCommand } from "../../discord/commands/groups";
import { data as TodayCommand } from "../../discord/commands/today";

const commands: CommandData[] = [
  CredentialsCommand,
  NotificationsCommand,
  RoomCommand,
  PresenceCommand,
  WeekCommand,
  PermissionsCommand,
  GroupsCommand,
  TodayCommand,
];

export class HelpCommand extends BaseCommand {
  async run({ interaction, client, handler }: SlashCommandProps) {
    await interaction.reply({
      embeds: [
        SimpleEmbed({
          title: "Lapelle Devinci",
          content: "Liste des commandes de Lapelle Devinci",
          emoji: "📚",
        }).setFields([
          {
            name: "/identifiants",
            value: "Ajouter/retirer vos identifiants du portail devinci",
          },
          {
            name: "/groups",
            value: "Gérer vos groupes (rejoindre, importer, quitter, voir)",
          },
          {
            name: "/permissions",
            value:
              "Gérer les roles/utilisateur autorisés à gérer les notifications du serveur",
          },
          {
            name: "/notifications",
            value: "Gérer les notifications de vos groupes/du serveur",
          },
          {
            name: "/lapelle",
            value: "Statut du relevé de présence de vos groupes",
          },
          {
            name: "/salle",
            value: "Voir la salle de votre prochain cours",
          },
          {
            name: "/aujourdhui",
            value: "Voir votre emploi du temps pour aujourd'hui",
          },
          {
            name: "/semaine",
            value: "Voir votre emploi du temps pour la semaine",
          },
        ]),
      ],
      ephemeral: true,
    });
  }
}
