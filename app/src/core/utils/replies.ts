import { SimpleEmbed } from "./embeds";

export const CommandReplies = {
  NotImplemented: (props?: any) => CommandReplies.Error(props),

  MissingCredentials: (props?: any) => ({
    embeds: [
      SimpleEmbed({
        content: "Vous n'avez pas renseigné vos identifiants.",
        emoji: "❌",
      }).setFields([
        {
          name: "Comment renseigner mes identifiants ?",
          value: "Utilisez la commande `/identifiants`\n",
        },
      ]),
    ],
    ...props?.override,
  }),

  Warning: (props?: any) => ({
    embeds: [
      SimpleEmbed({
        content: props?.message || "Une erreur est survenue.",
        emoji: "⚠️",
      }),
    ],
    ...props?.override,
  }),

  Waiting: (props?: any) => ({
    embeds: [
      SimpleEmbed({
        content: props?.message || "Veuillez patienter...",
        emoji: "⏳",
      }),
    ],
    ...props?.override,
  }),

  TooLong: (props?: any) => ({
    embeds: [
      SimpleEmbed({
        content: "Commande annulée : Vous avez mis trop de temps à répondre.",
        emoji: "⌛",
      }),
    ],
    components: [],
    ...props?.override,
  }),

  InvalidPassword: (props?: any) => CommandReplies.Error(props),

  Error: (props?: any) => ({
    embeds: [
      SimpleEmbed({
        content:
          props?.message || "Une erreur est survenue. Veuillez rééssayer.",
        emoji: "❌",
      }),
    ],
    components: [],
    ...props?.override,
  }),
};
