import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  MessageComponentInteraction,
  PermissionFlagsBits,
  RepliableInteraction,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  InsufficientPermissions,
  NoGroupFound,
  NoGroupWithNotificationsFound,
  NotImplemented,
} from "../utils/errors";
import { SimpleEmbed } from "../utils/embeds";
import {
  Notification,
  notifications,
} from "../database/entities/notifications";
import { db } from "../database";
import { and, eq } from "drizzle-orm";
import { Group, Permission, permissions, users } from "../database/entities";

export class NotificationsCommand extends BaseCommand {
  private permission!: Permission;

  getButtons() {
    // Create create button
    const createButton = new ButtonBuilder({
      customId: `${this.nonce}-notifications-create`,
      label: "Ajouter",
      emoji: "➕",
      style: ButtonStyle.Secondary,
    });

    // Create edit button
    const editButton = new ButtonBuilder({
      customId: `${this.nonce}-notifications-edit`,
      label: "Modifier",
      emoji: "🛠️",
      style: ButtonStyle.Secondary,
    });

    // Create delete button
    const deleteButton = new ButtonBuilder({
      customId: `${this.nonce}-notifications-delete`,
      label: "Supprimer",
      emoji: "🗑",
      style: ButtonStyle.Secondary,
    });

    return { createButton, editButton, deleteButton };
  }

  async show(interaction: RepliableInteraction) {
    const { createButton, editButton, deleteButton } = this.getButtons();

    const result = await db.query.notifications.findMany({
      where: eq(notifications.guild_id, interaction.guildId!),
      with: {
        group: true,
      },
    });

    const groupedNotifications = result.reduce<{
      [key: string]: Notification[];
    }>((groups, notification) => {
      const groupName = notification.group.name;
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(notification);
      return groups;
    }, {});

    const fields = Object.entries(groupedNotifications)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([groupName, groupNotifications]) => ({
        name: groupName,
        value: groupNotifications
          .map(
            (notification) => `
            Salon : <#${notification.channel_id}>
            Role(s) : ${
              notification.role_ids.length === 1
                ? `<@&${notification.role_ids[0]}>`
                : `\n${notification.role_ids
                    .map((id) => `<@&${id}>`)
                    .join("\n")}`
            }`
          )
          .join("\n"),
      }));

    const reply = {
      embeds: [
        SimpleEmbed({
          title: "Notifications",
          content: "Gérer les notifications enregistrées sur ce serveur.",
          emoji: "🔔",
        }).setFields([
          ...(!fields.length
            ? [
                {
                  name: "Oups...",
                  value: "Il n'y a aucune notification sur ce serveur !",
                },
              ]
            : fields),
        ]),
      ],
      components: this.timeout
        ? []
        : [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              createButton,
              editButton,
              deleteButton
            ),
          ],
    };

    if (this.timeout) {
      reply.embeds[0].addFields([
        {
          name: "Comment modifier/retirer les notifications ?",
          value: "Utilisez la commande `/notifications`",
        },
      ]);
    }

    if (interaction.replied) {
      await interaction.editReply(reply);
      return;
    }

    return interaction.reply({
      ...reply,
      ephemeral: true,
    });
  }

  async run({ interaction, client, handler }: SlashCommandProps) {
    const isPrivate = !interaction.inGuild();

    if (!isPrivate) {
      const isManager = await this.isManager({ interaction, client, handler });

      if (!isManager) {
        throw new InsufficientPermissions(
          "Vous ne pouvez pas modifier les notifications de ce serveur."
        );
      }

      await this.guild(interaction);
      return;
    }

    await this.private(interaction);
  }

  async guild(interaction: ChatInputCommandInteraction) {
    const result = await db
      .insert(permissions)
      .values({
        guild_id: interaction.guildId!,
        user_ids: [],
        role_ids: [],
      })
      .onConflictDoNothing({
        target: [permissions._id],
      })
      .returning();

    this.permission = result[0];

    const actionMessage = await this.show(interaction);

    if (!actionMessage) return;

    await new Promise((resolve, reject) => {
      const collector = actionMessage.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [
            `${this.nonce}-notifications-create`,
            `${this.nonce}-notifications-edit`,
            `${this.nonce}-notifications-delete`,
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
            case `${this.nonce}-notifications-create`:
              await this.create(i);
              break;
            case `${this.nonce}-notifications-edit`:
              await this.edit(i);
              break;

            case `${this.nonce}-notifications-delete`:
              await this.delete(i);
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

  async create(interaction: MessageComponentInteraction) {
    const result = await db.query.users.findFirst({
      where: eq(users._id, this.user._id),
      columns: {},
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

    const { groups: groupsRelations } = result;

    if (!groupsRelations.length) {
      throw new NoGroupFound();
    }

    const groupSelect = new StringSelectMenuBuilder()
      .setCustomId(`${this.nonce}-notification-add-group-select`)
      .setPlaceholder("Sélectionnez un groupe")
      .addOptions(
        groupsRelations.map(({ group }) => ({
          label: group.name,
          value: group.name,
        }))
      );

    await interaction.deferUpdate();
    const groupMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content: "À quel groupe souhaitez-vous ajouter une notification ?",
          emoji: "👥",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          groupSelect
        ),
      ],
      ephemeral: true,
    });

    const groupInteraction = await groupMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-add-group-select`,
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    // Set active interaction for error handling replies
    this.interaction = groupInteraction;

    const group = groupsRelations.find(
      ({ group }) => group.name === groupInteraction.values[0]
    )!;

    const groupNotifications = await db.query.notifications.findMany({
      where: and(
        eq(notifications.guild_id, interaction.guildId!),
        eq(notifications.group_id, group.group_id)
      ),
    });

    if (groupNotifications.length) {
      const confirmButton = new ButtonBuilder()
        .setCustomId(`${this.nonce}-notification-add-continue`)
        .setLabel("Continuer")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✅");

      const editButton = new ButtonBuilder()
        .setCustomId(`${this.nonce}-notification-add-edit`)
        .setLabel("Modifier")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🛠️");

      const cancelButton = new ButtonBuilder()
        .setCustomId(`${this.nonce}-notification-add-cancel`)
        .setLabel("Annuler")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️");

      const confirmMessage = await groupInteraction.update({
        embeds: [
          SimpleEmbed({
            content: `Ce groupe a déjà ${
              groupNotifications.length
            } notification${
              groupNotifications.length > 1 ? "s" : ""
            } enregistrée${
              groupNotifications.length > 1 ? "s" : ""
            } pour ce serveur.`,
            emoji: "⚠️",
          }).setFields([
            {
              name: "Que souhaitez-vous faire ?",
              value:
                "Vous pouvez continuer, modifier les notifications déjà existances ou annuler.",
            },
          ]),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            confirmButton,
            editButton,
            cancelButton
          ),
        ],
      });

      const confirmInteraction = await confirmMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [
            `${this.nonce}-notification-add-continue`,
            `${this.nonce}-notification-add-edit`,
            `${this.nonce}-notification-add-cancel`,
          ].includes(i.customId),
        componentType: ComponentType.Button,
        time: 60_000,
      });

      this.interaction = confirmInteraction;

      switch (confirmInteraction.customId) {
        case `${this.nonce}-notification-add-continue`:
          await this.addToGroup(confirmInteraction, group.group);
          break;
        case `${this.nonce}-notification-add-edit`:
          await this.editFromGroup(confirmInteraction, group.group);
          break;
        case `${this.nonce}-notification-add-cancel`:
          await confirmInteraction.update({
            embeds: [
              SimpleEmbed({
                content: "Ajout de notification annulé.",
                emoji: "❌",
              }),
            ],
            components: [],
          });
          return;
        default:
          throw new NotImplemented();
      }
    } else {
      await this.addToGroup(groupInteraction, group.group);
    }
  }

  async addToGroup(interaction: MessageComponentInteraction, group: Group) {
    const channelSelect = new ChannelSelectMenuBuilder({
      customId: `${this.nonce}-notification-add-channel-select`,
      placeholder: "Sélectionnez le salon à notifier",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    });

    const channelMessage = await interaction.update({
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          channelSelect
        ),
      ],
      embeds: [
        SimpleEmbed({
          content:
            "Dans quel salon souhaitez-vous recevoir les notifications ?",
          emoji: "📣",
        }),
      ],
    });

    const channelInteraction = await channelMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-add-channel-select`,
      componentType: ComponentType.ChannelSelect,
      time: 60_000,
    });

    this.interaction = channelInteraction;

    const roleSelect = new RoleSelectMenuBuilder({
      customId: `${this.nonce}-notification-add-role-select`,
      placeholder: "Sélectionnez les rôles à mentionnner",
      minValues: 1,
      maxValues: 5,
    });

    const roleMessage = await channelInteraction.update({
      embeds: [
        SimpleEmbed({
          content:
            "Quel rôle souhaitez-vous mentionner dans les notifications ?",
          emoji: "🎭",
        }),
      ],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      ],
    });

    const roleInteraction = await roleMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-add-role-select`,
      componentType: ComponentType.RoleSelect,
      time: 60_000,
    });

    this.interaction = roleInteraction;

    if (!group) {
      return;
    }

    await db.insert(notifications).values({
      guild_id: interaction.guildId!,
      channel_id: channelInteraction.values[0],
      role_ids: roleInteraction.values,
      group_id: group._id,
    });

    await Promise.all([
      roleInteraction.update({
        embeds: [
          SimpleEmbed({
            content: `La notification a bien été enregistrée !`,
            emoji: "✅",
          }).setFields([
            {
              name: "Récap' de la notification :",
              value: `
              Groupe : \`${group.name}\`
              Salon : <#${channelInteraction.values[0]}>
              Role(s) : ${
                roleInteraction.values.length === 1
                  ? `<@&${roleInteraction.values[0]}>`
                  : `\n${roleInteraction.values
                      .map((id) => `<@&${id}>`)
                      .join("\n")}`
              }
            `,
            },
          ]),
        ],
        components: [],
      }),
      this.update(),
    ]);

    // TODO: Add check if credentials can notify for this group
  }

  async edit(interaction: MessageComponentInteraction) {
    const result = await db.query.users.findFirst({
      where: eq(users._id, this.user._id),
      columns: {},
      with: {
        groups: {
          with: {
            group: {
              with: {
                notifications: true,
              },
            },
          },
        },
      },
    });

    if (!result?.groups.length) {
      throw new NoGroupWithNotificationsFound();
    }

    const { groups: groupsRelations } = result;

    const groupSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-notification-edit-group-select`,
      placeholder: "Sélectionnez un groupe",
      options: groupsRelations.map(({ group }) => ({
        label: group.name,
        value: group.name,
      })),
    });

    await interaction.deferUpdate();
    const groupMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content:
            "Dans quel groupe souhaitez-vous modifier les notifications ?",
          emoji: "👥",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          groupSelect
        ),
      ],
      ephemeral: true,
    });

    const groupInteraction = await groupMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-edit-group-select`,
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    this.interaction = groupInteraction;

    const group = groupsRelations.find(
      ({ group }) => group.name === groupInteraction.values[0]
    )!;

    await this.editFromGroup(groupInteraction, group.group);
  }

  async editFromGroup(interaction: MessageComponentInteraction, group: Group) {
    const result = await db.query.notifications.findMany({
      where: and(
        eq(notifications.guild_id, interaction.guildId!),
        eq(notifications.group_id, group._id)
      ),
    });

    if (!result.length) {
      throw new NoGroupWithNotificationsFound();
    }

    const channels = await interaction.guild?.channels.fetch();
    const roles = await interaction.guild?.roles.fetch();

    const notificationSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-notification-edit-notification-select`,
      placeholder: "Sélectionnez une notification à modifier",
      options: result.map((notification) => ({
        label: channels?.get(notification.channel_id)?.name || "Salon inconnu",
        description: `Role(s):\n ${
          notification.role_ids.length === 1
            ? `${roles?.get(notification.role_ids[0])?.name}`
            : `${notification.role_ids
                .map((id) => roles?.get(id)?.name)
                .join(", ")}`
        }`,
        value: notification._id.toString(),
      })),
    });

    const notificationMessage = await interaction.update({
      embeds: [
        SimpleEmbed({
          content: `Quelle notification du groupe souhaitez-vous modifier ?`,
          emoji: "🛠️",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          notificationSelect
        ),
      ],
    });

    const notificationInteraction =
      await notificationMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId === `${this.nonce}-notification-edit-notification-select`,
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

    this.interaction = notificationInteraction;

    const notification = result.find(
      (notification) =>
        notification._id.toString() === notificationInteraction.values[0]
    )!;

    const channelSelect = new ChannelSelectMenuBuilder({
      customId: `${this.nonce}-notification-edit-channel-select`,
      placeholder: "Sélectionnez le salon à notifier",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    });

    const channelMessage = await notificationInteraction.update({
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          channelSelect
        ),
      ],
      embeds: [
        SimpleEmbed({
          content:
            "Dans quel salon souhaitez-vous recevoir les notifications ?",
          emoji: "📣",
        }),
      ],
    });

    const channelInteraction = await channelMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-edit-channel-select`,
      componentType: ComponentType.ChannelSelect,
      time: 60_000,
    });

    this.interaction = channelInteraction;

    const roleSelect = new RoleSelectMenuBuilder({
      customId: `${this.nonce}-notification-edit-role-select`,
      placeholder: "Sélectionnez les rôles à mentionnner",
      minValues: 1,
      maxValues: 5,
    }).setDefaultRoles(notification.role_ids);

    const roleMessage = await channelInteraction.update({
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      ],
    });

    const roleInteraction = await roleMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-edit-role-select`,
      componentType: ComponentType.RoleSelect,
      time: 60_000,
    });

    this.interaction = roleInteraction;

    await db.update(notifications).set({
      ...notification,
      channel_id: channelInteraction.values[0],
      role_ids: roleInteraction.values,
    });

    await Promise.all([
      roleInteraction.update({
        embeds: [
          SimpleEmbed({
            content: `La notification a bien été mise à jour !`,
            emoji: "✅",
          }).setFields([
            {
              name: "Récap' de la notification :",
              value: `
              Groupe : \`${group.name}\`
              Salon : <#${channelInteraction.values[0]}>
              Role(s) : ${
                roleInteraction.values.length === 1
                  ? `<@&${roleInteraction.values[0]}>`
                  : `\n${roleInteraction.values
                      .map((id) => `<@&${id}>`)
                      .join("\n")}`
              }
            `,
            },
          ]),
        ],
        components: [],
      }),
      this.update(),
    ]);
  }

  async delete(interaction: MessageComponentInteraction) {
    const result = await db.query.users.findFirst({
      where: eq(users._id, this.user._id),
      columns: {},
      with: {
        groups: {
          with: {
            group: {
              with: {
                notifications: true,
              },
            },
          },
        },
      },
    });

    if (!result?.groups.length) {
      throw new NoGroupWithNotificationsFound();
    }

    const { groups } = result;

    const groupSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-notification-delete-group-select`,
      placeholder: "Sélectionnez un groupe",
      options: groups.map(({ group }) => ({
        label: group.name,
        value: group.name,
      })),
    });

    await interaction.deferUpdate();
    const groupMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content:
            "Dans quel groupe souhaitez-vous supprimer une notification ?",
          emoji: "👥",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          groupSelect
        ),
      ],
      ephemeral: true,
    });

    const groupInteraction = await groupMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-notification-delete-group-select`,
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    this.interaction = groupInteraction;

    const group = groups.find(
      ({ group }) => group.name === groupInteraction.values[0]
    )!;

    await this.deleteFromGroup(groupInteraction, group.group);
  }

  async deleteFromGroup(
    interaction: MessageComponentInteraction,
    group: Group
  ) {
    const result = await db.query.notifications.findMany({
      where: and(
        eq(notifications.guild_id, interaction.guildId!),
        eq(notifications.group_id, group._id)
      ),
    });

    const channels = await interaction.guild?.channels.fetch();
    const roles = await interaction.guild?.roles.fetch();

    const notificationSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-notification-delete-notification-select`,
      placeholder: "Sélectionnez une notification à supprimer",
      options: result.map((notification) => ({
        label: channels?.get(notification.channel_id)?.name || "Salon inconnu",
        description: `Role(s):\n ${
          notification.role_ids.length === 1
            ? `${roles?.get(notification.role_ids[0])?.name}`
            : `${notification.role_ids
                .map((id) => roles?.get(id)?.name)
                .join(", ")}`
        }`,
        value: notification._id.toString(),
      })),
    });

    const notificationMessage = await interaction.update({
      embeds: [
        SimpleEmbed({
          content: `Quelle notification du groupe souhaitez-vous supprimer ?`,
          emoji: "🗑️",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          notificationSelect
        ),
      ],
    });

    const notificationInteraction =
      await notificationMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId ===
            `${this.nonce}-notification-delete-notification-select`,
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

    this.interaction = notificationInteraction;

    const notification = result.find(
      (notification) =>
        notification._id.toString() === notificationInteraction.values[0]
    )!;

    await db
      .delete(notifications)
      .where(eq(notifications._id, notification._id));

    await Promise.all([
      notificationInteraction.update({
        embeds: [
          SimpleEmbed({
            content: `La notification a bien été supprimée !`,
            emoji: "✅",
          }),
        ],
        components: [],
      }),
      this.update(),
    ]);
  }

  async isManager({ interaction, client, handler }: SlashCommandProps) {
    const user = await interaction.guild?.members.fetch(interaction.user.id);

    if (!user) {
      throw new Error("CouldNotFetchUser");
    }

    return (
      handler.devUserIds.includes(user.id) ||
      this.permission.user_ids.includes(user.id) ||
      handler.devRoleIds.some((id) => user?.roles.cache.has(id)) ||
      this.permission.role_ids.some((id) => user?.roles.cache.has(id)) ||
      user?.permissions.has(PermissionFlagsBits.Administrator)
    );
  }

  async private(interaction: ChatInputCommandInteraction) {
    const notificationsOptions = [
      {
        label: "Ouverture de l'appel",
        description: "Recevoir une notification lorsqu'un appel est ouvert",
        value: "presence",
        default: this.user.notifications.includes("presence"),
      },
      {
        label: "Emploi du temps de la journée",
        description: "Recevoir l'emploi du temps à chaque début de journée",
        value: "today",
        default: this.user.notifications.includes("today"),
      },
      {
        label: "Emploi du temps de la semaine",
        description: "Recevoir l'emploi du temps à chaque début de semaine",
        value: "week",
        default: this.user.notifications.includes("week"),
      },
    ];

    const notificationsSelect = new StringSelectMenuBuilder()
      .setCustomId(`${this.nonce}-notification-private-notifications-select`)
      .setPlaceholder("Quelle notification souhaitez-vous modifier ?")
      .addOptions(notificationsOptions)
      .setMinValues(0)
      .setMaxValues(notificationsOptions.length);

    const notificationsRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        notificationsSelect
      );

    const notificationsMessage = await interaction.reply({
      embeds: [
        SimpleEmbed({
          title: "Notifications (messages privés)",
          content: "Quelles notifications souhaitez-vous recevoir ?",
          emoji: "🔔",
        }).setFields([
          {
            name: "Récap' de vos notifications :",
            value: `
              ${notificationsOptions
                .map((option) =>
                  this.user.notifications.includes(option.value)
                    ? `✅ ${option.label}`
                    : `❌ ~~${option.label}~~`
                )
                .join("\n")}`,
          },
          {
            name: "Comment modifier/retirer des notifications ?",
            value: "Utilisez la commande `/notifications`",
          },
        ]),
      ],
      components: [notificationsRow],
    });

    const notificationsInteraction =
      await notificationsMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId ===
            `${this.nonce}-notification-private-notifications-select`,
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

    const updatedUsers = await db
      .update(users)
      .set({
        notifications: notificationsInteraction.values,
      })
      .where(eq(users._id, this.user._id))
      .returning();
    this.user = updatedUsers[0];

    await notificationsInteraction.update({
      embeds: [
        SimpleEmbed({
          title: "Notifications (messages privés)",
          content: "Quelles notifications souhaitez-vous recevoir ?",
          emoji: "🔔",
        }).setFields([
          {
            name: "Récap' de vos notifications :",
            value: `
              ${notificationsOptions
                .map((option) =>
                  this.user.notifications.includes(option.value)
                    ? `✅ ${option.label}`
                    : `❌ ~~${option.label}~~`
                )
                .join("\n")}`,
          },
          {
            name: "Comment modifier/retirer des notifications ?",
            value: "Utilisez la commande `/notifications`",
          },
        ]),
      ],
      components: [],
    });
  }
}
