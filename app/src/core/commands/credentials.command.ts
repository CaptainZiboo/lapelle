import { SlashCommandProps } from "commandkit";
import { SimpleEmbed } from "../utils/embeds";
import { BaseCommand } from "./command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponse,
  MessageComponentInteraction,
  ModalBuilder,
  RepliableInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CommandReplies } from "../utils/replies";
import { Portail } from "../../services/portail";
import { NoGroupToImport, NotImplemented } from "../utils/errors";
import { groups } from "../database/entities/groups";
import { db } from "../database";
import { and, eq, notInArray } from "drizzle-orm";
import { users, usersToGroups } from "../database/entities";
import { sign } from "../utils/jwt";
import { whitespace } from "../utils/text";

export class CredentialsCommand extends BaseCommand {
  getButtons() {
    // Create Login button
    const loginButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-login`,
      label: "Se connecter",
      style: ButtonStyle.Secondary,
    });

    // Create Logout button
    const logoutButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-remove`,
      label: "Supprimer",
      style: ButtonStyle.Secondary,
    });

    // Create Code link
    const codeLink = new ButtonBuilder({
      url: "https://github.com/CaptainZiboo/lapelle",
      label: "Code",
      style: ButtonStyle.Link,
    });

    return { loginButton, logoutButton, codeLink };
  }

  async show(
    interaction: RepliableInteraction
  ): Promise<InteractionResponse | undefined> {
    const { codeLink, loginButton, logoutButton } = this.getButtons();

    const reply = {
      embeds: [
        SimpleEmbed({
          title: "Identifiants",
          emoji: "🔑",
          content:
            "Gérer (ajouter/retirer) vos identifiants du portail devinci",
        }).setFields([
          {
            name: "Statut de la connexion :",
            value: this.user.credentials
              ? `✅${whitespace}Vous êtes connecté au portail Devinci`
              : `❌${whitespace}Vous n'êtes pas connecté au portail Devinci`,
          },
          {
            name: "Pourquoi se connecter ?",
            value:
              "Se connecter vous permet de débloquer certaines fonctionnalités en relation avec le portail Léonard de Vinci.",
          },
          {
            name: "Informations sensibles :",
            value: `📑${whitespace}Le code du bot est entièrement open-source pour des questions de transparence, vous pouvez ainsi vérifier que vos identifiants ne sont pas transmis à des tiers ou utilisés à des fins malveillantes.\n[Voir Lapelle Devinci sur Github](https://github.com/CaptainZiboo/lapelle)`,
          },
        ]),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>({
          components: [
            !this.timeout && this.user.credentials ? logoutButton : loginButton,
            codeLink,
          ],
        }),
      ],
    };

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
    const { codeLink } = this.getButtons();

    // Send message with buttons
    const actionMessage = await this.show(interaction);

    if (!actionMessage) return;

    // Await for button click(s)
    await new Promise((resolve, reject) => {
      const collector = actionMessage.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [
            `${this.nonce}-credentials-login`,
            `${this.nonce}-credentials-remove`,
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
            case `${this.nonce}-credentials-login`:
              await this.login(i);
              break;
            case `${this.nonce}-credentials-remove`:
              await this.logout(i);
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

  async login(interaction: ButtonInteraction) {
    // Create modal email field
    const emailField = new TextInputBuilder({
      customId: "email",
      label: "Adresse mail",
      placeholder: "prenom.nom@edu.devinci.fr",
      style: TextInputStyle.Short,
      required: true,
    });

    // Create modal password field
    const passwordField = new TextInputBuilder({
      customId: "password",
      label: "Mot de passe",
      placeholder: "**********",
      style: TextInputStyle.Short,
      required: true,
    });

    // Credentials login modal
    const credentialsModal = new ModalBuilder({
      customId: `${this.nonce}-credentials-add-modal`,
      title: "Connexion au portail",
      components: [
        new ActionRowBuilder<TextInputBuilder>({
          components: [emailField],
        }),
        new ActionRowBuilder<TextInputBuilder>({
          components: [passwordField],
        }),
      ],
    });

    await interaction.showModal(credentialsModal);

    // Await for modal submit
    const loginInteraction = await interaction.awaitModalSubmit({
      filter: (i) =>
        i.customId === `${this.nonce}-credentials-add-modal` &&
        i.user.id === interaction.user.id,
      time: 60000,
    });

    // Set active interaction for error handling replies
    this.interaction = loginInteraction;

    // Send waiting reply while checking credentials
    await loginInteraction.reply(
      CommandReplies.Waiting({
        message: "Vérification de vos identifiants en cours...",
        override: {
          components: [],
          ephemeral: true,
        },
      })
    );

    // Get credentials from modal submit interaction
    const credentials = {
      email: loginInteraction.fields.getTextInputValue("email"),
      password: loginInteraction.fields.getTextInputValue("password"),
    };

    // Open website (scraping) and check credentials
    const portail = new Portail(this.user, { credentials });
    await portail.use();

    // Update user credentials in database
    const updatedUsers = await db
      .update(users)
      .set({ credentials: sign(credentials) })
      .where(eq(users._id, this.user._id))
      .returning();
    this.user = updatedUsers[0];

    // Send success reply
    await Promise.all([
      loginInteraction.editReply({
        embeds: [
          SimpleEmbed({
            content: "Vos identifiants ont bien été enregistrés !",
            emoji: "✅",
          }),
        ],
      }),

      this.update(),
    ]);

    // Ask if user wants to syncronize groups
    const syncButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-login-sync`,
      label: "Synchroniser",
      emoji: "🔄",
      style: ButtonStyle.Secondary,
    });

    const noSyncButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-login-no-sync`,
      label: "Non merci",
      emoji: "❌",
      style: ButtonStyle.Secondary,
    });

    const syncMessage = await loginInteraction.followUp({
      embeds: [
        SimpleEmbed({
          content: "Souhaitez-vous synchroniser vos groupes avec le portail ?",
          emoji: "🔄",
        }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>({
          components: [syncButton, noSyncButton],
        }),
      ],
      ephemeral: true,
    });

    // Await for button click(s)
    const syncInteraction = await syncMessage.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        [
          `${this.nonce}-credentials-login-sync`,
          `${this.nonce}-credentials-login-no-sync`,
        ].includes(i.customId),
      componentType: ComponentType.Button,
      time: 60000,
    });

    this.interaction = syncInteraction;

    switch (syncInteraction.customId) {
      case `${this.nonce}-credentials-login-sync`:
        // Sync user groups
        await this.sync(syncInteraction);
        break;
      case `${this.nonce}-credentials-login-no-sync`:
        // Send cancelled reply
        await syncInteraction.update({
          components: [],
          embeds: [
            SimpleEmbed({
              content: "Vos groupes n'ont pas été synchronisées.",
              emoji: "⚠️",
            }).addFields([
              {
                name: "Pourquoi synchroniser mes groupes ?",
                value:
                  "Synchroniser vos groupes vous permet de gérer vos notifications de groupe depuis Discord, sur vos serveurs et en message privés.",
              },
            ]),
          ],
        });
        break;
      default:
        throw new NotImplemented();
    }
  }

  async sync(interaction: MessageComponentInteraction) {
    await interaction.update(
      CommandReplies.Waiting({
        message: "Synchronisation de vos groupes en cours...",
        override: {
          components: [],
          ephemeral: true,
        },
      })
    );

    const portail = new Portail(this.user);
    const portailGroupNames = await portail.use((portail) =>
      portail.getGroups()
    );

    if (!portailGroupNames?.length) {
      throw new NoGroupToImport();
    }

    const portailGroups = (
      await Promise.all(
        portailGroupNames.map((name) =>
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
      customId: `${this.nonce}-credentials-login-sync-erase`,
      label: "Écraser",
      emoji: "🗑",
      style: ButtonStyle.Danger,
    });

    const keepButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-login-sync-keep`,
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
          `${this.nonce}-credentials-login-sync-erase`,
          `${this.nonce}-credentials-login-sync-keep`,
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
      case `${this.nonce}-credentials-login-sync-erase`:
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
      case `${this.nonce}-credentials-login-sync-keep`:
        break;
    }

    await eraseInteraction.update({
      embeds: [
        SimpleEmbed({
          content: "Vos groupes ont bien été synchronisés !",
          emoji: "✅",
        }),
      ],
      components: [],
    });
  }

  async logout(interaction: ButtonInteraction) {
    // Create confirmation button
    const confirmLogoutButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-logout-confirm`,
      label: "Supprimer",
      style: ButtonStyle.Danger,
    });

    // Create cancel button
    const cancelLogoutButton = new ButtonBuilder({
      customId: `${this.nonce}-credentials-logout-cancel`,
      label: "Annuler",
      style: ButtonStyle.Secondary,
    });

    await interaction.deferUpdate();

    // Send confirmation request with buttons
    const confirmLogoutMessage = await interaction.followUp({
      embeds: [
        SimpleEmbed({
          content: "Êtes-vous sûr de vouloir supprimer vos identifiants ?",
          emoji: "❌",
        }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>({
          components: [confirmLogoutButton, cancelLogoutButton],
        }),
      ],
      ephemeral: true,
    });

    // Await for button click(s)
    const logoutInteraction = await confirmLogoutMessage.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      componentType: ComponentType.Button,
      time: 60000,
    });

    // Set active interaction for error handling replies
    this.interaction = logoutInteraction;

    switch (logoutInteraction.customId) {
      case `${this.nonce}-credentials-logout-confirm`:
        // Remove user credentials in database
        const updatedUsers = await db
          .update(users)
          .set({ credentials: null })
          .where(eq(users._id, this.user._id))
          .returning();

        this.user = updatedUsers[0];

        // Send success reply
        await Promise.all([
          logoutInteraction.update({
            components: [],
            embeds: [
              SimpleEmbed({
                content: "Vos identifiants ont bien été supprimés !",
                emoji: "✅",
              }),
            ],
          }),

          this.update(),
        ]);
        break;
      case `${this.nonce}-credentials-logout-cancel`:
        // Send cancelled reply
        await logoutInteraction.update({
          components: [],
          embeds: [
            SimpleEmbed({
              content: "Suppression annulée.",
              emoji: "✅",
            }),
          ],
        });
        break;
      default:
        throw new NotImplemented();
    }
  }
}
