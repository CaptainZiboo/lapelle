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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lapelle = void 0;
const discord_js_1 = require("discord.js");
const lapelle_1 = require("../../utils/lapelle");
const esilv_1 = require("../../utils/esilv");
exports.Lapelle = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("lapelle")
        .setDescription("Réponds avec le statut de l'appel du cours !"),
    execute(interaction) {
        return __awaiter(this, void 0, void 0, function* () {
            let options = null;
            for (const year of esilv_1.SupportedYears) {
                for (const formation of esilv_1.SupportedFormations) {
                    if (interaction.channelId === process.env[`${year}_${formation}_CHANNEL`]) {
                        options = { year, formation };
                    }
                }
            }
            if (!options) {
                /* await interaction.reply({
                  content:
                    "Channel invalide, impossible de déterminer l'année et la formation !",
                }); */
                const select = new discord_js_1.StringSelectMenuBuilder()
                    .setCustomId("year")
                    .setPlaceholder("Année scolaire")
                    .addOptions(esilv_1.SupportedYears.map((year) => new discord_js_1.StringSelectMenuOptionBuilder().setLabel(year).setValue(year)));
                const actionRow = new discord_js_1.ActionRowBuilder().addComponents(select);
                const reply = yield interaction.reply({
                    content: "Année d'études",
                    components: [actionRow],
                });
                const collector = reply.createMessageComponentCollector({
                    componentType: discord_js_1.ComponentType.StringSelect,
                    filter: (i) => i.user.id === interaction.user.id && i.customId === interaction.id,
                    time: 60000,
                });
                collector.on("collect", (interaction) => {
                    console.log(interaction.values);
                });
                return;
            }
            yield interaction.deferReply();
            (0, lapelle_1.getLapelle)(({ open, cours, message }) => __awaiter(this, void 0, void 0, function* () {
                if (message.endsWith(".")) {
                    // Retirer le dernier caractère (le point)
                    message = message.slice(0, -1);
                }
                if (open) {
                    yield interaction.editReply(`L'appel est ouvert !\n${cours.presence}`);
                }
                else {
                    yield interaction.editReply(`${message} !`);
                }
            }), options);
        });
    },
};
exports.default = exports.Lapelle;
