"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Require the necessary discord.js classes
const discord_js_1 = require("discord.js");
const lapelle_1 = require("./utils/lapelle");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const radash_1 = require("radash");
const node_cron_1 = __importDefault(require("node-cron"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
const PastPresences = [];
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        // Create a new client instance
        const commands = new discord_js_1.Collection();
        const foldersPath = path_1.default.join(__dirname, "commands");
        const commandFolders = fs_1.default.readdirSync(foldersPath);
        for (const folder of commandFolders) {
            const commandsPath = path_1.default.join(foldersPath, folder);
            const commandFiles = fs_1.default
                .readdirSync(commandsPath)
                .filter((file) => file.endsWith(".js") || file.endsWith(".ts"));
            for (const file of commandFiles) {
                const filePath = path_1.default.join(commandsPath, file);
                const { default: command } = require(filePath);
                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ("data" in command && "execute" in command) {
                    console.log("COMMANDE", command);
                    commands.set(command.data.name, command);
                }
                else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            }
        }
        client.on(discord_js_1.Events.InteractionCreate, (interaction) => __awaiter(this, void 0, void 0, function* () {
            if (!interaction.isChatInputCommand())
                return;
            const command = commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            try {
                yield command.execute(interaction);
            }
            catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    yield interaction.followUp({
                        content: "There was an error while executing this command!",
                        ephemeral: true,
                    });
                }
                else {
                    yield interaction.reply({
                        content: "There was an error while executing this command!",
                        ephemeral: true,
                    });
                }
            }
        }));
        // When the client is ready, run this code (only once)
        // We use 'c' for the event parameter to keep it separate from the already defined 'client'
        client.once(discord_js_1.Events.ClientReady, (c) => {
            console.log(`Ready! Logged in as ${c.user.tag}`);
        });
        // Log in to Discord with your client's token
        client.login(process.env.DISCORD_TOKEN);
    });
}
const send = (message, options) => {
    const GUILD_ID = process.env[`${options.ecole.year}_${options.ecole.formation}_GUILD`] || "";
    const CHANNEL_ID = process.env[`${options.ecole.year}_${options.ecole.formation}_CHANNEL`] ||
        "";
    const ROLE_ID = process.env[`${options.ecole.year}_${options.ecole.formation}_ROLE`] || "";
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        const channel = guild.channels.cache.get(CHANNEL_ID);
        const role = guild.roles.cache.get(ROLE_ID);
        if (channel && channel instanceof discord_js_1.TextChannel && role) {
            channel.send({
                content: (0, radash_1.template)(message, { role: `<@&${role.id}>` }),
                files: [path_1.default.join(__dirname, "../assets/shovel.png")],
            });
        }
    }
};
const loop = (options) => {
    console.log("Starting loop to check for presence status");
    setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            console.log("Fetching presence status...");
            yield (0, lapelle_1.getLapelle)(({ open, cours, message }) => {
                if (message.endsWith(".")) {
                    // Retirer le dernier caractère (le point)
                    message = message.slice(0, -1);
                }
                if (cours && !PastPresences.includes(cours.presence)) {
                    send(`L'appel est ouvert ! {{role}}\n${cours.presence}`, {
                        image: true,
                        ecole: options,
                    });
                    PastPresences.push(cours.presence);
                }
            }, options);
        }
        catch (error) {
            console.log("Error", error);
        }
    }), 30 * 1000);
};
start();
loop({ year: "A3", formation: "ALTERNANCE" });
const empty = () => {
    PastPresences.splice(0, PastPresences.length);
    console.log("Tableau des cours vidé.");
};
node_cron_1.default.schedule("59 23 * * *", empty);
