import puppeteer from "puppeteer";
import { logger } from "./logger";
import { LoopLapelleOptions } from "..";
import { DateTime } from "luxon";

type LapelleCallbackArgs =
  | {
      open: boolean;
      message: string;
      cours: {
        heure: string;
        prof: string;
        cours: string;
        presence: string;
      };
    }
  | {
      open: false;
      message: string;
      cours?: {
        heure: string;
        prof: string;
        cours: string;
        presence: string;
      };
    };

export async function getLapelle(
  callback: (payload: LapelleCallbackArgs) => void | Promise<void>,
  options: LoopLapelleOptions
) {
  const email =
    process.env[
      `${options.diplome}_${options.year}_${options.formation}_EMAIL`
    ];
  const password =
    process.env[
      `${options.diplome}_${options.year}_${options.formation}_PASSWORD`
    ];
  if (!email || !password) {
    console.log("Missing environment variables...");
    return { error: "Des variables d'environnement sont manquantes..." };
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });

    const page = await browser.newPage();

    try {
      console.log("Ouverture de la page...");

      await page.goto("https://www.leonard-de-vinci.net/student/presences/");
      await page.waitForSelector("body");

      const currentURL = page.url();
      if (currentURL === "https://www.leonard-de-vinci.net/") {
        console.log("Redirection réussie!");

        await page.waitForSelector("#login");
        console.log("Champ #login trouvé.");

        // Remplir le champ #login avec l'email
        await page.type("#login", email);
        console.log("Champ #login rempli avec succès.");

        // Attendre jusqu'à ce que la valeur du champ #login soit correctement définie
        await page.waitForFunction(
          (expectedValue) => {
            const input = document.querySelector("#login") as HTMLInputElement;
            return input && input.value === expectedValue;
          },
          {},
          email
        );

        console.log("Champ #login vérifié après le remplissage.");

        await Promise.all([page.click("#btn_next"), page.waitForNavigation()]);

        await page.waitForSelector("#userNameInput");
        console.log("Page après la redirection chargée avec succès.");

        const userNameInput = await page.$("#userNameInput");
        if (userNameInput) {
          await page.$eval("#userNameInput", (input) => {
            (input as HTMLInputElement).value = "";
          });
        }

        await page.type("#userNameInput", email);
        console.log("Champ #userNameInput rempli avec succès.");

        await page.waitForSelector("#passwordInput");
        console.log("Champ #passwordInput présent.");

        await page.waitForTimeout(3000);

        await page.type("#passwordInput", password);
        console.log("Champ #passwordInput rempli avec succès.");

        await Promise.all([
          page.click("#submitButton"),
          page.waitForNavigation(),
        ]);

        console.log("Have been redirected to bla bla bla");

        await Promise.all([
          page.goto("https://www.leonard-de-vinci.net/student/presences/"),
          page.waitForNavigation(),
        ]);

        await page.waitForSelector("body");

        const currentURLAfterLogin = page.url();
        if (
          currentURLAfterLogin ===
          "https://www.leonard-de-vinci.net/student/presences/"
        ) {
          console.log("Accès à la page après connexion réussi!");
        } else {
          logger.error(
            "La redirection après connexion a échoué. URL actuelle :",
            currentURLAfterLogin
          );
        }
      } else if (
        currentURL === "https://www.leonard-de-vinci.net/student/presences/"
      ) {
        console.log(
          "Vous êtes déjà connecté, passage à la suite du programme."
        );
      } else {
        logger.error("La redirection a échoué. URL actuelle :", currentURL);
      }

      await page.waitForSelector("#body_presences");

      const rows = await page.$$("#body_presences tr");
      const now = new Date();

      let currentCourseFound = false;
      for (const row of rows) {
        const heure = await row.$eval("td:nth-child(1)", (td) =>
          td && td.textContent ? td.textContent.trim().replace(/\s+/g, "") : ""
        );

        console.log("HEURE", heure);

        const prof = await row.$eval("td:nth-child(2)", (td) =>
          td && td.textContent ? td.textContent.trim() : ""
        );

        console.log("PROF", prof);

        const cours = await row.$eval("td:nth-child(3)", (td) =>
          td && td.textContent ? td.textContent.trim() : ""
        );

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
          const lienRelevePresence = await row.$("td:nth-child(4) a");
          console.log("Lien relevé", lienRelevePresence);
          if (lienRelevePresence) {
            await lienRelevePresence.click();
            await page.waitForTimeout(3000);

            // const isPresenceOpen =

            const bodyPresenceDiv = await page.$("#body_presence");

            if (!bodyPresenceDiv) {
              console.error("THERE IS A PROBLEM HUSTON");
              throw new Error("THERE IS A PROBLEM HUSTON");
            }

            const state = await bodyPresenceDiv.evaluate(() => {
              const dangerAlert = document.querySelector(".alert.alert-danger");
              const successAlert = document.querySelector(
                ".alert.alert-success"
              );
              const setPresenceSpan =
                document.querySelector("span#set-presence");

              if (dangerAlert && dangerAlert.textContent) {
                return {
                  open: false,
                  message: dangerAlert.textContent.trim(),
                };
              } else if (successAlert && successAlert.textContent) {
                return {
                  open: true,
                  message: successAlert.textContent.trim(),
                };
              } else if (
                setPresenceSpan &&
                setPresenceSpan.textContent?.includes("Valider la présence")
              ) {
                return {
                  open: true,
                  message: "L'appel est ouvert",
                };
              } else {
                // Si aucun des cas ci-dessus n'est rencontré, l'état est indéterminé
                return {
                  open: false,
                  message: "L'état de l'appel est indéterminé",
                };
              }
            });

            console.log("state", state);

            const presence = page.url();

            callback({
              ...state,
              cours: {
                heure,
                prof,
                cours,
                presence,
              },
            });

            currentCourseFound = true;
            break;
          } else {
            console.log("Impossible de trouver le lien du relevé de présence.");
            callback({
              open: false,
              message: "Impossible de trouver le lien du relevé de présence.",
            });
          }
        }
      }

      await page.waitForTimeout(10000);

      if (!currentCourseFound) {
        console.log("Aucun cours n'a lieu actuellement.");
        callback({
          open: false,
          message: "Aucun cours n'a lieu actuellement.",
        });
      }
    } catch (error) {
      logger.error("Une erreur s'est produite :", error);
      callback({
        open: false,
        message: `Une erreur s'est produite: ${error}`,
      });
    } finally {
      await browser.close();
      console.log("Fermeture du navigateur.");
    }
  } catch (error) {
    console.error(error);
  }
}
