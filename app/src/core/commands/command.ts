import { SlashCommandProps } from "commandkit";
import { DiscordError, NotImplemented } from "../utils/errors";
import {
  InteractionResponse,
  RepliableInteraction,
  UserFlags,
} from "discord.js";
import { logger } from "../utils/logger";
import { Subject } from "rxjs";
import { User, users } from "../database/entities";
import { db } from "../database";
import { eq } from "drizzle-orm";

interface InteractionStatus<T> {
  subject: Subject<any>;
  ongoing: boolean;
  ended: boolean;
}

export class BaseCommand {
  /**
   * @description A random string used to identify the command
   */
  public nonce!: string;

  /**
   * @description The user who called the command
   */
  public user!: User;

  /**
   * @description The command timeout status
   */
  public timeout?: boolean;

  /**
   * @description The actively used interaction
   */
  public interaction?: RepliableInteraction;

  constructor(public context: SlashCommandProps) {}

  /**
   * @description Authenticate the user and set command user
   */
  async authenticate(id: string): Promise<void> {
    let user = await db.query.users.findFirst({
      where: eq(users.discord_id, id),
    });

    if (!user) {
      const result = await db
        .insert(users)
        .values({
          discord_id: id,
          notifications: [],
        })
        .returning();

      user = result[0];
    }

    this.user = user;
  }

  /**
   * @description Run the command interaction
   */
  async run({ interaction, client, handler }: SlashCommandProps) {
    throw new NotImplemented();
  }

  async use() {
    const { interaction, client, handler } = this.context;

    try {
      // Set the active interaction
      this.nonce = interaction.id;
      this.interaction = interaction;

      await this.authenticate(interaction.user.id);
      await this.run({ interaction, client, handler });
    } catch (error: any) {
      try {
        logger.error("Error from command");
        logger.error(error.stack);
        // Handle (and display) the error
        await DiscordError.handle({
          interaction: this.interaction || interaction,
          error,
        });
      } catch (error) {
        logger.error("Error from command error handling");
      }
    }
  }

  async show(
    interaction: RepliableInteraction
  ): Promise<InteractionResponse | void> {
    throw new NotImplemented();
  }

  async update() {
    const { interaction } = this.context;
    await this.show(interaction);
  }
}
