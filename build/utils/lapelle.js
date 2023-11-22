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
exports.getLapelle = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
const logger_1 = require("./logger");
function getLapelle(callback, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = process.env[`${options.year}_${options.formation}_EMAIL`];
        const password = process.env[`${options.year}_${options.formation}_PASSWORD`];
        if (!email || !password) {
            console.log("Missing environment variables...");
            return { error: "Des variables d'environnement sont manquantes..." };
        }
        const browser = yield puppeteer_1.default.launch({
            headless: "new",
            args: ["--no-sandbox"],
        });
        const page = yield browser.newPage();
        try {
            console.log("Ouverture de la page...");
            yield page.goto("https://www.leonard-de-vinci.net/student/presences/");
            yield page.waitForSelector("body");
            const currentURL = page.url();
            if (currentURL === "https://www.leonard-de-vinci.net/") {
                console.log("Redirection réussie!");
                yield page.waitForSelector("#login");
                console.log("Champ #login trouvé.");
                // Remplir le champ #login avec l'email
                yield page.type("#login", email);
                console.log("Champ #login rempli avec succès.");
                // Attendre jusqu'à ce que la valeur du champ #login soit correctement définie
                yield page.waitForFunction((expectedValue) => {
                    const input = document.querySelector("#login");
                    return input && input.value === expectedValue;
                }, {}, email);
                console.log("Champ #login vérifié après le remplissage.");
                yield Promise.all([page.click("#btn_next"), page.waitForNavigation()]);
                yield page.waitForSelector("#userNameInput");
                console.log("Page après la redirection chargée avec succès.");
                const userNameInput = yield page.$("#userNameInput");
                if (userNameInput) {
                    yield page.$eval("#userNameInput", (input) => {
                        input.value = "";
                    });
                }
                yield page.type("#userNameInput", email);
                console.log("Champ #userNameInput rempli avec succès.");
                yield page.waitForSelector("#passwordInput");
                console.log("Champ #passwordInput présent.");
                yield page.waitForTimeout(3000);
                yield page.type("#passwordInput", password);
                console.log("Champ #passwordInput rempli avec succès.");
                yield Promise.all([
                    page.click("#submitButton"),
                    page.waitForNavigation(),
                ]);
                console.log("Have been redirected to bla bla bla");
                yield Promise.all([
                    page.goto("https://www.leonard-de-vinci.net/student/presences/"),
                    page.waitForNavigation(),
                ]);
                yield page.waitForSelector("body");
                const currentURLAfterLogin = page.url();
                if (currentURLAfterLogin ===
                    "https://www.leonard-de-vinci.net/student/presences/") {
                    console.log("Accès à la page après connexion réussi!");
                }
                else {
                    logger_1.logger.error("La redirection après connexion a échoué. URL actuelle :", currentURLAfterLogin);
                }
            }
            else if (currentURL === "https://www.leonard-de-vinci.net/student/presences/") {
                console.log("Vous êtes déjà connecté, passage à la suite du programme.");
            }
            else {
                logger_1.logger.error("La redirection a échoué. URL actuelle :", currentURL);
            }
            yield page.waitForSelector("#body_presences");
            const rows = yield page.$$("#body_presences tr");
            const now = new Date();
            let currentCourseFound = false;
            for (const row of rows) {
                const heure = yield row.$eval("td:nth-child(1)", (td) => td && td.textContent ? td.textContent.trim().replace(/\s+/g, "") : "");
                console.log("HEURE", heure);
                const prof = yield row.$eval("td:nth-child(2)", (td) => td && td.textContent ? td.textContent.trim() : "");
                console.log("PROF", prof);
                const cours = yield row.$eval("td:nth-child(3)", (td) => td && td.textContent ? td.textContent.trim() : "");
                console.log("COURS", cours);
                const [heureDebut, heureFin] = heure.split("-");
                const [debutHours, debutMinutes] = heureDebut.split(":").map(Number);
                const debutTime = new Date();
                debutTime.setHours(debutHours, debutMinutes, 0);
                console.log(debutTime);
                const [finHours, finMinutes] = heureFin.split(":").map(Number);
                const finTime = new Date();
                finTime.setHours(finHours, finMinutes, 0);
                console.log(finTime);
                console.log("checking course time");
                if (now >= debutTime && now <= finTime) {
                    console.log("Course is currently up");
                    const lienRelevePresence = yield row.$("td:nth-child(4) a");
                    console.log("Lien relevé", lienRelevePresence);
                    if (lienRelevePresence) {
                        yield lienRelevePresence.click();
                        yield page.waitForTimeout(3000);
                        // const isPresenceOpen =
                        const bodyPresenceDiv = yield page.$("#body_presence");
                        if (!bodyPresenceDiv) {
                            console.error("THERE IS A PROBLEM HUSTON");
                            throw new Error("THERE IS A PROBLEM HUSTON");
                        }
                        const state = yield bodyPresenceDiv.evaluate(() => {
                            var _a;
                            const dangerAlert = document.querySelector(".alert.alert-danger");
                            const successAlert = document.querySelector(".alert.alert-success");
                            const setPresenceSpan = document.querySelector("span#set-presence");
                            if (dangerAlert && dangerAlert.textContent) {
                                return {
                                    open: false,
                                    message: dangerAlert.textContent.trim(),
                                };
                            }
                            else if (successAlert && successAlert.textContent) {
                                return {
                                    open: true,
                                    message: successAlert.textContent.trim(),
                                };
                            }
                            else if (setPresenceSpan &&
                                ((_a = setPresenceSpan.textContent) === null || _a === void 0 ? void 0 : _a.includes("Valider la présence"))) {
                                return {
                                    open: true,
                                    message: "L'appel est ouvert",
                                };
                            }
                            else {
                                // Si aucun des cas ci-dessus n'est rencontré, l'état est indéterminé
                                return {
                                    open: false,
                                    message: "L'état de l'appel est indéterminé",
                                };
                            }
                        });
                        console.log("state", state);
                        const presence = page.url();
                        callback(Object.assign(Object.assign({}, state), { cours: {
                                heure,
                                prof,
                                cours,
                                presence,
                            } }));
                        currentCourseFound = true;
                        break;
                    }
                    else {
                        console.log("Impossible de trouver le lien du relevé de présence.");
                        callback({
                            open: false,
                            message: "Impossible de trouver le lien du relevé de présence.",
                        });
                    }
                }
            }
            yield page.waitForTimeout(10000);
            if (!currentCourseFound) {
                console.log("Aucun cours n'a lieu actuellement.");
                callback({
                    open: false,
                    message: "Aucun cours n'a lieu actuellement.",
                });
            }
        }
        catch (error) {
            logger_1.logger.error("Une erreur s'est produite :", error);
            callback({
                open: false,
                message: `Une erreur s'est produite: ${error}`,
            });
        }
        finally {
            yield browser.close();
            console.log("Fermeture du navigateur.");
        }
    });
}
exports.getLapelle = getLapelle;
