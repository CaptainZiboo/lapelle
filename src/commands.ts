import { ApplicationCommand, REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

export async function getCommands() {
  const commands = [];
  // Grab all the command files from the commands directory you created earlier
  const foldersPath = path.join(__dirname, "commands");
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);

    // Vérifiez si commandsPath est un répertoire
    if (fs.statSync(commandsPath).isDirectory()) {
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".ts"));

      // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const { command } = await import(filePath);
        if ("data" in command && "execute" in command) {
          commands.push(command.data.toJSON());
        } else {
          console.log(
            `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
          );
        }
      }
    } else if (commandsPath.endsWith(".ts")) {
      // Si commandsPath est un fichier .ts à la racine, traitez-le de la même manière
      const { command } = await import(commandsPath);
      if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
      } else {
        console.log(
          `[WARNING] The command at ${commandsPath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }
  return commands;
}

async function setCommands() {
  const commands = await getCommands();

  if (DISCORD_CLIENT_ID && DISCORD_TOKEN) {
    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(DISCORD_TOKEN);

    // and deploy your commands!
    try {
      console.log(
        `Started refreshing ${commands.length} application (/) commands.`
      );

      // The put method is used to fully refresh all commands in the guild with the current set
      const data = (await rest.put(
        Routes.applicationCommands(DISCORD_CLIENT_ID),
        { body: commands }
      )) as ApplicationCommand[];

      console.log(
        `Successfully reloaded ${data.length} application (/) commands.`
      );
    } catch (error) {
      // And of course, make sure you catch and log any errors!
      console.error(error);
    }
  }
}

// Appel de la fonction pour déployer les commandes
setCommands();
