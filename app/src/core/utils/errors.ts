import {
  CommandInteraction,
  Interaction,
  RepliableInteraction,
} from "discord.js";
import { CommandReplies } from "./replies";

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
    if (error.message.trim().endsWith("time")) {
      if (interaction.replied) {
        await interaction.editReply(CommandReplies.TooLong());
      } else {
        await interaction.editReply(CommandReplies.TooLong());
      }

      return;
    }

    let reply = CommandReplies.Error();

    if (error instanceof DiscordError && error.reply) {
      reply = error.reply;
    }

    if (interaction.replied) {
      return interaction.editReply(reply);
    } else {
      return interaction.reply({
        ...reply,
        ephemeral: true,
      });
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
    super(
      "InvalidPassword",
      CommandReplies.Error({
        message: "Mot de passe invalide, veuillez rééssayer.",
      })
    );
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
