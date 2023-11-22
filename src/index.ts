// Require the necessary discord.js classes
import {
  Collection,
  Events,
  GatewayIntentBits,
  Client,
  TextChannel,
} from "discord.js";
import { Command } from "./@types/command";
import { getLapelle } from "./utils/lapelle";
import dotenv from "dotenv";
import path from "path";
import { template } from "radash";
import cron from "node-cron";
import fs from "fs";
import { deploy } from "./register";

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const PastPresences: string[] = [];

async function start() {
  // Create a new client instance

  const commands = new Collection<string, Command>();

  const foldersPath = path.join(__dirname, "commands");
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js") || file.endsWith(".ts"));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const { default: command } = require(filePath);
      // Set a new item in the Collection with the key as the command name and the value as the exported module
      if ("data" in command && "execute" in command) {
        console.log("COMMANDE", command);
        commands.set(command.data.name, command);
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  });

  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
  });

  // Log in to Discord with your client's token
  client.login(process.env.DISCORD_TOKEN);
}

interface SendMessageOptions {
  image: boolean;
  ecole: LoopLapelleOptions;
}

const send = (message: string, options: SendMessageOptions) => {
  const GUILD_ID =
    process.env[
      `${options.ecole.diplome}_${options.ecole.year}_${options.ecole.formation}_GUILD`
    ] || "";
  const CHANNEL_ID =
    process.env[
      `${options.ecole.diplome}_${options.ecole.year}_${options.ecole.formation}_CHANNEL`
    ] || "";
  const ROLE_ID =
    process.env[
      `${options.ecole.diplome}_${options.ecole.year}_${options.ecole.formation}_ROLE`
    ] || "";

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    const channel = guild.channels.cache.get(CHANNEL_ID);
    const role = guild.roles.cache.get(ROLE_ID);

    if (channel && channel instanceof TextChannel && role) {
      channel.send({
        content: template(message, { role: `<@&${role.id}>` }),
        files: [path.join(__dirname, "../assets/shovel.png")],
      });
    }
  }
};

export interface LoopLapelleOptions {
  diplome: string;
  year: string;
  formation: string;
}

const loop = (options: LoopLapelleOptions) => {
  console.log("Starting loop to check for presence status");
  setInterval(async () => {
    try {
      console.log("Fetching presence status...");
      await getLapelle(({ open, cours, message }) => {
        if (message.endsWith(".")) {
          // Retirer le dernier caractère (le point)
          message = message.slice(0, -1);
        }
        if (open && !PastPresences.includes(cours.presence)) {
          send(`L'appel est ouvert ! {{role}}\n${cours.presence}`, {
            image: true,
            ecole: options,
          });
          PastPresences.push(cours.presence);
        }
      }, options);
    } catch (error) {
      console.log("Error", error);
    }
  }, 30 * 1000);
};

start();
loop({ diplome: "BIN", year: "A3", formation: "ALTERNANCE" });

const empty = () => {
  PastPresences.splice(0, PastPresences.length);
  console.log("Tableau des cours vidé.");
};

cron.schedule("59 23 * * *", empty);
