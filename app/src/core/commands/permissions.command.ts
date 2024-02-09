import { SlashCommandProps } from "commandkit";
import { BaseCommand } from "./command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  InteractionResponse,
  MessageComponentInteraction,
  PermissionFlagsBits,
  RepliableInteraction,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import { InsufficientPermissions, NotImplemented } from "../utils/errors";
import { Permission, permissions } from "../database/entities/permissions";
import { SimpleEmbed } from "../utils/embeds";
import { eq } from "drizzle-orm";
import { db } from "../database";

export class PermissionsCommand extends BaseCommand {
  private permission!: Permission;

  async show(
    interaction: RepliableInteraction
  ): Promise<InteractionResponse | undefined> {
    const button = new ButtonBuilder({
      customId: `${this.nonce}-permissions-manage`,
      label: "Gérer les permissions",
      style: ButtonStyle.Secondary,
      emoji: "🛠",
    });

    const reply = {
      embeds: [
        SimpleEmbed({
          title: "Permissions",
          content:
            "Roles et utilisateurs autorisés à gérer les notifications du serveur.",
          emoji: "🔑",
        }).addFields([
          {
            name: "Utilisateur(s) autorisé(s)",
            value: this.permission.user_ids.length
              ? this.permission.user_ids.map((user) => `<@${user}>`).join("\n")
              : "Aucun",
          },
          {
            name: "Role(s) autorisé(s)",
            value: this.permission.role_ids.length
              ? this.permission.role_ids.map((role) => `<@&${role}>`).join("\n")
              : "Aucun",
          },
        ]),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>({
          components: [button],
        }),
      ],
    };

    if (interaction.replied) {
      interaction.editReply(reply);
      return;
    }
    return interaction.reply({
      ...reply,
      ephemeral: true,
    });
  }

  async update() {
    const { interaction } = this.context;
    await this.show(interaction);
  }

  async run({ interaction, client, handler }: SlashCommandProps) {
    const isAdministrator = await this.isAdministrator({
      interaction,
      client,
      handler,
    });

    if (!isAdministrator) {
      throw new InsufficientPermissions();
    }
    let permission: Permission | undefined =
      await db.query.permissions.findFirst({
        where: eq(permissions.guild_id, interaction.guildId!),
      });

    if (!permission) {
      const result = await db
        .insert(permissions)
        .values({
          guild_id: interaction.guildId!,
          user_ids: [],
          role_ids: [],
        })
        .returning();
      permission = result[0];
    }

    this.permission = permission;

    // Show the permission
    const actionMessage = await this.show(interaction);

    if (!actionMessage) return;

    await new Promise((resolve, reject) => {
      const collector = actionMessage.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [`${this.nonce}-permissions-manage`].includes(i.customId),
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
            case `${this.nonce}-permissions-manage`:
              await this.manage(i);
              break;
            default:
              reject(new NotImplemented());
          }

          running = true;

          if (collector.ended) {
            // Resolve the promise if the collector ended
            resolve(true);
          }
        } catch (error) {
          reject(error);
        }
      });

      collector.on("end", async (_, reason) => {
        if (reason === "time") {
          this.timeout = true;
          await interaction.editReply({
            components: [
              new ActionRowBuilder<ButtonBuilder>({
                components: [],
              }),
            ],
          });
          if (running) return;
          resolve(true);
        }
        reject(reason);
      });
    });
  }

  async manage(interaction: MessageComponentInteraction) {
    const actionSelect = new StringSelectMenuBuilder({
      customId: `${this.nonce}-manage-type-select`,
      placeholder: "Souhaitez vous gérer les roles ou les utilisateurs ?",
      options: [
        {
          label: "Gérer les utilisateurs",
          value: `${this.nonce}-manage-user`,
        },
        {
          label: "Gérer les roles",
          value: `${this.nonce}-manage-role`,
        },
      ],
    });

    await interaction.deferUpdate();
    const actionMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content:
            "Gérer les utilisateurs/roles autorisés à gérer les notifications de ce serveur",
          emoji: "🛠",
        }),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          actionSelect
        ),
      ],
      ephemeral: true,
    });

    const actionInteraction = await actionMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-manage-type-select`,
      componentType: ComponentType.StringSelect,
      time: 60000,
    });

    this.interaction = actionInteraction;

    switch (actionInteraction.values[0]) {
      case `${this.nonce}-manage-user`:
        await this.users(actionInteraction);
        break;
      case `${this.nonce}-manage-role`:
        await this.roles(actionInteraction);
        break;
    }
  }

  async users(interaction: MessageComponentInteraction) {
    const usersSelect = new UserSelectMenuBuilder({
      customId: `${this.nonce}-manage-user-select`,
      placeholder: "Veuillez mentionner un utilisateur.",
      minValues: 0,
      maxValues: interaction.guild?.memberCount || 0,
    }).setDefaultUsers(this.permission.user_ids);

    const usersMessage = await interaction.update({
      embeds: [
        SimpleEmbed({
          content:
            "Choisissez les utilsateurs autorisés à gérer les notifications de ce serveur.",
          emoji: "👤",
        }),
      ],
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          usersSelect
        ),
      ],
    });

    const usersInteraction = await usersMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-manage-user-select`,
      componentType: ComponentType.UserSelect,
      time: 60000,
    });

    this.interaction = usersInteraction;

    await db
      .update(permissions)
      .set({
        user_ids: usersInteraction.values,
      })
      .where(eq(permissions._id, this.permission._id));

    await Promise.all([
      usersInteraction.update({
        embeds: [
          SimpleEmbed({
            content: "Les permissions ont bien été mises à jour.",
            emoji: "✅",
          }),
        ],
        components: [],
      }),

      this.update(),
    ]);
  }

  async roles(interaction: MessageComponentInteraction) {
    const rolesSelect = new RoleSelectMenuBuilder({
      customId: `${this.nonce}-manage-role-select`,
      placeholder: "Veuillez sélectionner les roles autorisés",
      minValues: 0,
      maxValues: interaction.guild?.roles.cache.size || 0,
    }).setDefaultRoles(this.permission.role_ids);

    const rolesMessage = await interaction.update({
      embeds: [
        SimpleEmbed({
          content:
            "Choisissez les roles autorisés à gérer les notifications de ce serveur.",
          emoji: "👤",
        }),
      ],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          rolesSelect
        ),
      ],
    });

    const rolesInteraction = await rolesMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `${this.nonce}-manage-role-select`,
      componentType: ComponentType.RoleSelect,
      time: 60000,
    });

    this.interaction = rolesInteraction;

    await db
      .update(permissions)
      .set({
        role_ids: rolesInteraction.values,
      })
      .where(eq(permissions._id, this.permission._id));

    await Promise.all([
      rolesInteraction.update({
        embeds: [
          SimpleEmbed({
            content: "Les permissions ont bien été mises à jour.",
            emoji: "✅",
          }),
        ],
        components: [],
      }),
      this.update(),
    ]);
  }

  async isAdministrator({ interaction, client, handler }: SlashCommandProps) {
    const user = await interaction.guild?.members.fetch(interaction.user.id);

    if (!user) {
      throw new Error("CouldNotFetchUser");
    }

    return (
      handler.devUserIds.includes(user.id) ||
      handler.devRoleIds.some((id) => user?.roles.cache.has(id)) ||
      user?.permissions.has(PermissionFlagsBits.Administrator)
    );
  }
}
