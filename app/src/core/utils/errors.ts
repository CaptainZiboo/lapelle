import {
  CommandInteraction,
  Interaction,
  RepliableInteraction,
} from "discord.js";
import { CommandReplies } from "./replies";
import { logger } from "./logger";

export class DiscordError extends Error {
  constructor(message: string, public reply?: any) {
    super(message);
  }

  static async handle({
    interaction,
    error,
  }: {
    error: any;
    interaction: RepliableInteraction;
  }) {
    try {
      if (error.message.trim().endsWith("time")) {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply(CommandReplies.TooLong());
        } else {
          await interaction.editReply(CommandReplies.TooLong());
        }

        return;
      }

      let reply = CommandReplies.Error();

      if (error instanceof DiscordError && error.reply) {
        reply = error.reply;
      }

      if (interaction.isRepliable() && !interaction.replied) {
        return interaction.reply({
          ...reply,
          ephemeral: true,
        });
      } else {
        return interaction.editReply({
          ...reply,
          ephemeral: true,
        });
      }
    } catch (error: any) {
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply(
            CommandReplies.Error({
              override: {
                ephemeral: true,
              },
            })
          );
        } else {
          await interaction.followUp(
            CommandReplies.Error({
              override: {
                ephemeral: true,
              },
            })
          );
        }
      } catch (error: any) {
        logger.error("unable to send error message");
      } finally {
        logger.error("error from DiscordError.handle");
        logger.error(error.stack);
      }
    }
  }
}

export class InvalidEmail extends DiscordError {
  constructor() {
    super(
      "InvalidEmail",
      CommandReplies.Error({
        message: "Adresse mail invalide, veuillez rééssayer.",
      })
    );
  }
}

export class InvalidPassword extends DiscordError {
  constructor() {
    const reply = CommandReplies.Error({
      message: "Connexion au portail impossible, veuillez rééssayer.",
    });

    reply.embeds[0].setFields([
      {
        name: "Pourquoi ?",
        value:
          "Les identifiants que vous avez renseignés sont peut être incorrects. Il se peut également que le portail soit actuellement indisponible ou que la demande du bot soit trop importante.",
      },
    ]);

    super("CouldNotLogin", reply);
  }
}

export class InvalidCredentials extends DiscordError {
  constructor() {
    super(
      "InvalidCredentials",
      CommandReplies.Error({
        message: "Identifiants invalides, veuillez rééssayer.",
      })
    );
  }
}

export class MissingCredentials extends DiscordError {
  constructor() {
    super("CredentialsNotFound", CommandReplies.MissingCredentials());
  }
}

export class InsufficientPermissions extends DiscordError {
  constructor(message?: string) {
    super(
      "InsufficientPermissions",
      CommandReplies.Error({
        message: message || "Vous n'avez pas les permissions requises.",
      })
    );
  }
}

export class NotImplemented extends DiscordError {
  constructor(message?: string) {
    super(
      "NotImplemented",
      CommandReplies.NotImplemented({
        message: message || "Cette fonctionnalité n'est pas encore disponible.",
      })
    );
  }
}

export class NoGroupFound extends DiscordError {
  constructor() {
    super(
      "NoGroups",
      CommandReplies.Error({
        message: "Vous n'avez pas encore rejoint de groupe.",
      })
    );
  }
}

export class NoGroupToImport extends DiscordError {
  constructor() {
    super(
      "NoGroupToImport",
      CommandReplies.Error({
        message: "Aucun groupe n'a été trouvé sur le portail.",
      })
    );
  }
}

export class NoGroupWithNotificationsFound extends DiscordError {
  constructor() {
    super(
      "NoGroups",
      CommandReplies.Error({
        message:
          "Aucun de vos groupes n'a de notification ajoutée sur ce serveur.",
      })
    );
  }
}

export class NoNextCourse extends DiscordError {
  constructor() {
    super(
      "NoNextCourse",
      CommandReplies.Error({
        message: "Vous n'avez plus de cours aujourd'hui !",
      })
    );
  }
}

export class NoCurrentCourse extends DiscordError {
  constructor() {
    super(
      "NoCurrentCourse",
      CommandReplies.Error({
        message: "Vous n'avez pas cours actuellement !",
      })
    );
  }
}

export class NoCourseToday extends DiscordError {
  constructor() {
    super(
      "NoCourseToday",
      CommandReplies.Error({
        message: "Vous n'avez pas cours aujourd'hui !",
      })
    );
  }
}
