import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageComponentInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  RepliableInteraction,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CommandReplies } from "../utils/replies";
import { SimpleEmbed } from "../utils/embeds";
import { Group, groups } from "../database/entities/groups";
import { Portail } from "../../services/portail";
import {
  NoGroupToImport,
  NoGroupFound,
  NotImplemented,
  MissingCredentials,
} from "../utils/errors";
import { db } from "../database";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { users, usersToGroups } from "../database/entities";

export class GroupsCommand extends BaseCommand {
  getButtons() {
    const createButton = new ButtonBuilder({
      customId: `${this.nonce}-groups-join`,
      label: "Rejoindre",
      emoji: "📥",
      style: ButtonStyle.Secondary,
    });

    const syncButton = new ButtonBuilder({
      customId: `${this.nonce}-groups-sync`,
      label: "Synchroniser",
      emoji: "🔄",
      style: ButtonStyle.Secondary,
    });

    const leaveButton = new ButtonBuilder({
      customId: `${this.nonce}-groups-leave`,
      label: "Quitter",
      emoji: "📤",
      style: ButtonStyle.Secondary,
    });

    return {
      createButton,
      syncButton,
      leaveButton,
    };
  }

  public async show(interaction: RepliableInteraction) {
    const { createButton, syncButton, leaveButton } = this.getButtons();

    const result = await db.query.users.findFirst({
      columns: {},
      where: eq(users._id, this.user._id),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    const { groups: groupsRelations } = result!;

    const reply = {
      embeds: [
        SimpleEmbed({
          title: "Groupes",
          content: groupsRelations.length
            ? `Vous faites partie **${groupsRelations.length} groupe(s)** !`
            : "Vous ne faites partie d'aucun groupe.",
          emoji: "👥",
        }),
      ],
      components: this.timeout
        ? []
        : [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              createButton,
              syncButton,
              leaveButton
            ),
          ],
    };

    if (groupsRelations.length) {
      reply.embeds[0].addFields([
        {
          name: "Liste de vos groupes :",
          value: `\`\`\`\n${groupsRelations
            .map(({ group }) => group.name)
            .join("\n")}\`\`\``,
        },
      ]);
    }

    reply.embeds[0].addFields([
      {
        name: "Pourquoi des groupes ?",
        value:
          "Les groupes correspondent aux groupes étudiants que vous pourrez retrouver sur votre [fiche étudiant](https://www.leonard-de-vinci.net/?my=fiche), sur le portail de l'école. Ils permettent de vous associer à vos différents cours.",
      },
    ]);

    if (interaction.replied) {
      await interaction.editReply(reply);
      return;
    }

    return interaction.reply({
      ...reply,
      ephemeral: true,
    });
  }

  public async run({ interaction }: SlashCommandProps) {
    const actionMessage = await this.show(interaction);

    if (!actionMessage) return;

    // Waiting for user to choose an action
    await new Promise((resolve, reject) => {
      const collector = actionMessage.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [
            `${this.nonce}-groups-join`,
            `${this.nonce}-groups-sync`,
            `${this.nonce}-groups-leave`,
          ].includes(i.customId),
        componentType: ComponentType.Button,
        time: 180_000,
      });

      let running: boolean = false;

      collector.on("collect", async (i) => {
        try {
          // Subscribe to user updates
          running = true;

          // Set active interaction for error handling replies
          this.interaction = i;

          // Redirect interaction to the right handler
          switch (i.customId) {
            case `${this.nonce}-groups-join`:
              await this.join(i);
              break;
            case `${this.nonce}-groups-sync`:
              await this.sync(i);
              break;

            case `${this.nonce}-groups-leave`:
              await this.leave(i);
              break;
            default:
              reject(new NotImplemented());
          }

          running = false;

          if (collector.ended) {
            // Resolve promise if collector is ended
            resolve(true);
          }
        } catch (error) {
          reject(error);
        }
      });

      collector.on("end", async (_, reason) => {
        if (reason === "time") {
          this.timeout = true;
          await this.update();
          if (running) return;
          resolve(true);
        }
        reject(reason);
      });
    });
  }

  public async join(interaction: MessageComponentInteraction) {
    const modal = new ModalBuilder({
      customId: `${this.nonce}-group-join-modal`,
      title: "Rejoindre un groupe",
    });

    const input = new TextInputBuilder({
      customId: "name",
      label: "Nom du groupe",
      placeholder: "GROUPE1, GROUPE2...",
      style: TextInputStyle.Paragraph,
      required: true,
    });

    modal.addComponents([
      new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
        input
      ),
    ]);

    await interaction.showModal(modal);

    const ModalSubmitInteraction = await interaction.awaitModalSubmit({
      filter: (i) =>
        i.customId === `${this.nonce}-group-join-modal` &&
        i.user.id === interaction.user.id,
      time: 120_000,
    });

    this.interaction = ModalSubmitInteraction;

    const names = ModalSubmitInteraction.fields
      .getTextInputValue("name")
      .split(/,|\s|\n/)
      .map((name) => name.trim())
      .filter((name) => name !== "");

    const uniqueNames = [...new Set(names)];

    const userAddedGroups = await db
      .insert(groups)
      .values(uniqueNames.map((name) => ({ name })))
      .onConflictDoUpdate({
        target: [groups.name],
        set: {
          name: sql`excluded.name`,
        },
      })
      .returning();

    await db
      .insert(usersToGroups)
      .values(
        userAddedGroups.map((group) => ({
          user_id: this.user._id,
          group_id: group._id,
          verified: true,
        }))
      )
      .onConflictDoNothing()
      .execute();

    await Promise.all([
      ModalSubmitInteraction.isRepliable() && !ModalSubmitInteraction.replied
        ? ModalSubmitInteraction.reply({
            embeds: [
              SimpleEmbed({
                content: `Vous avez rejoint les ${userAddedGroups.length} nouveau(x) groupe(s) !`,
                emoji: "✅",
              }).addFields([
                {
                  name: "Vous avez rejoint les groupes suivants :",
                  value: `\`\`\`\n${userAddedGroups
                    .map((group) => group.name)
                    .join("\n")}\`\`\``,
                },
              ]),
            ],
            components: [],
            ephemeral: true,
          })
        : ModalSubmitInteraction.editReply({
            embeds: [
              SimpleEmbed({
                content: `Vous avez rejoint les ${userAddedGroups.length} nouveau(x) groupe(s) !`,
                emoji: "✅",
              }).addFields([
                {
                  name: "Vous avez rejoint les groupes suivants :",
                  value: `\`\`\`\n${userAddedGroups
                    .map((group) => group.name)
                    .join("\n")}\`\`\``,
                },
              ]),
            ],
            components: [],
          }),
      this.update(),
    ]);
  }

  public async sync(interaction: MessageComponentInteraction) {
    await interaction.reply(
      CommandReplies.Waiting({
        message: "Synchronisation de vos groupes en cours...",
        override: {
          components: [],
          ephemeral: true,
        },
      })
    );

    const portail = new Portail(this.user);
    const portailGroupsNames = await portail.use((portail) =>
      portail.getGroups()
    );

    if (!portailGroupsNames) {
      throw new NoGroupToImport();
    }

    const portailGroups = (
      await Promise.all(
        portailGroupsNames.map((name) =>
          db
            .insert(groups)
            .values({ name, verified: true })
            .onConflictDoUpdate({
              target: [groups.name],
              set: {
                name,
                verified: true,
              },
            })
            .returning()
        )
      )
    ).flat();

    const eraseButton = new ButtonBuilder({
      customId: `${this.nonce}-groups-sync-erase`,
      label: "Écraser",
      emoji: "🗑",
      style: ButtonStyle.Danger,
    });

    const keepButton = new ButtonBuilder({
      customId: `${this.nonce}-groups-sync-keep`,
      label: "Conserver",
      emoji: "🔒",
      style: ButtonStyle.Secondary,
    });

    const eraseMessage = await interaction.editReply({
      embeds: [
        SimpleEmbed({
          content: `Voulez-vous écraser vos groupes actuels ?`,
          emoji: "🔄",
        }).addFields([
          {
            name: "Groupes trouvés sur le portail :",
            value: `\`\`\`\n${portailGroups
              .map((group) => group.name)
              .join("\n")}\`\`\``,
          },
        ]),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          eraseButton,
          keepButton
        ),
      ],
    });

    const eraseInteraction = await eraseMessage.awaitMessageComponent({
      filter: (i) =>
        [
          `${this.nonce}-groups-sync-erase`,
          `${this.nonce}-groups-sync-keep`,
        ].includes(i.customId) && i.user.id === interaction.user.id,
      componentType: ComponentType.Button,
      time: 60000,
    });

    const userAddedGroups = await db
      .insert(usersToGroups)
      .values(
        portailGroups.map((g) => ({
          user_id: this.user._id,
          group_id: g._id,
          verified: true,
        }))
      )
      .onConflictDoUpdate({
        target: [usersToGroups.user_id, usersToGroups.group_id],
        set: {
          verified: true,
        },
      })
      .returning({ group_id: usersToGroups.group_id });

    switch (eraseInteraction.customId) {
      case `${this.nonce}-groups-sync-erase`:
        await db
          .delete(usersToGroups)
          .where(
            and(
              eq(usersToGroups.user_id, this.user._id),
              notInArray(
                usersToGroups.group_id,
                userAddedGroups.map((g) => g.group_id)
              )
            )
          )
          .returning();

        break;
      case `${this.nonce}-groups-sync-keep`:
        break;
    }

    // Groups are imported, sending response to the user
    await Promise.all([
      interaction.editReply({
        embeds: [
          SimpleEmbed({
            content: "Vos groupes ont bien été synchronisés !",
            emoji: "✅",
          }),
        ],
        components: [],
      }),
      this.update(),
    ]);
  }

  public async leave(interaction: MessageComponentInteraction) {
    const result = await db.query.users.findFirst({
      where: eq(users._id, this.user._id),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    if (!result?.groups.length) {
      throw new NoGroupFound();
    }

    const { groups } = result;

    const leaveSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-groups-leave-select`,
      placeholder: "Sélectionnez un ou plusieurs groupes",
      options: groups.map(({ group }) => ({
        label: group.name,
        value: JSON.stringify(group),
      })),
      minValues: 1,
      maxValues: groups.length,
    });

    await interaction.deferUpdate();
    const leaveMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content: `Quel(s) groupe(s) souhaitez-vous quitter ?`,
          emoji: "📤",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          leaveSelect
        ),
      ],
      ephemeral: true,
    });

    const leaveInteraction = await leaveMessage.awaitMessageComponent({
      filter: (i) =>
        i.customId === `${this.nonce}-groups-leave-select` &&
        i.user.id === interaction.user.id,
      componentType: ComponentType.StringSelect,
      time: 60000,
    });

    this.interaction = leaveInteraction;

    await db
      .delete(usersToGroups)
      .where(
        and(
          eq(usersToGroups.user_id, this.user._id),
          inArray(
            usersToGroups.group_id,
            leaveInteraction.values.map((v) => parseInt(JSON.parse(v)._id))
          )
        )
      )
      .execute();

    await Promise.all([
      leaveInteraction.update({
        embeds: [
          SimpleEmbed({
            content: `Vous avez quitté le(s) groupe(s) sélectionné(s) !`,
            emoji: "✅",
          }).setFields([
            {
              name: "Vous avez quitté les groupes suivants :",
              value: leaveInteraction.values
                .map((v) => JSON.parse(v).name)
                .join("\n"),
            },
          ]),
        ],
        components: [],
      }),
      this.update(),
    ]);
  }
}
