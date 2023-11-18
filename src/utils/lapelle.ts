import puppeteer from "puppeteer";
import { logger } from "./logger";

export async function getLapelle() {
  if (!process.env.EMAIL || !process.env.MOT_DE_PASSE) {
    return { error: "Des variables d'environnement sont manquantes..." };
  }

  const browser = await puppeteer.launch({
    headless: false,
  });

  const page = await browser.newPage();

  try {
    logger.debug("Ouverture de la page...");

    await page.goto("https://www.leonard-de-vinci.net/student/presences/");
    await page.waitForSelector("body");

    const currentURL = page.url();
    if (currentURL === "https://www.leonard-de-vinci.net/") {
      logger.debug("Redirection réussie!");

      await page.waitForSelector("#login");
      logger.debug("Champ #login trouvé.");

      // Remplir le champ #login avec l'email
      await page.type("#login", process.env.EMAIL || "");
      logger.debug("Champ #login rempli avec succès.");

      // Attendre jusqu'à ce que la valeur du champ #login soit correctement définie
      await page.waitForFunction(
        (expectedValue) => {
          const input = document.querySelector("#login") as HTMLInputElement;
          return input && input.value === expectedValue;
        },
        {},
        process.env.EMAIL || ""
      );

      logger.debug("Champ #login vérifié après le remplissage.");

      await Promise.all([page.click("#btn_next"), page.waitForNavigation()]);

      await page.waitForSelector("#userNameInput");
      logger.debug("Page après la redirection chargée avec succès.");

      const userNameInput = await page.$("#userNameInput");
      if (userNameInput) {
        await page.$eval("#userNameInput", (input) => {
          (input as HTMLInputElement).value = "";
        });
      }

      await page.type("#userNameInput", process.env.EMAIL || "");
      logger.debug("Champ #userNameInput rempli avec succès.");

      await page.waitForSelector("#passwordInput");
      logger.debug("Champ #passwordInput présent.");

      await page.waitForTimeout(3000);

      await page.type("#passwordInput", process.env.MOT_DE_PASSE || "");
      logger.debug("Champ #passwordInput rempli avec succès.");

      await Promise.all([
        page.click("#submitButton"),
        page.waitForNavigation(),
      ]);

      logger.debug("Have been redirected to bla bla bla");

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
        logger.debug("Accès à la page après connexion réussi!");
      } else {
        logger.error(
          "La redirection après connexion a échoué. URL actuelle :",
          currentURLAfterLogin
        );
      }
    } else if (
      currentURL === "https://www.leonard-de-vinci.net/student/presences/"
    ) {
      logger.debug("Vous êtes déjà connecté, passage à la suite du programme.");
    } else {
      logger.error("La redirection a échoué. URL actuelle :", currentURL);
    }

    await page.waitForSelector("#body_presences");

    const rows = await page.$$("#body_presences tr");
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    let currentCourseFound = false;
    for (const row of rows) {
      const heureText = await row.$eval("td:nth-child(1)", (td) =>
        td && td.textContent ? td.textContent.trim() : ""
      );

      const heureCleaned = heureText.replace(/\s+/g, "");
      const [heureDebut, heureFin] = heureCleaned.split("-");
      const [debutHours, debutMinutes] = heureDebut.split(":").map(Number);
      const debutTime = new Date();
      debutTime.setHours(debutHours, debutMinutes, 0);

      const [finHours, finMinutes] = heureFin.split(":").map(Number);
      const finTime = new Date();
      finTime.setHours(finHours, finMinutes, 0);

      if (now >= debutTime && now <= finTime) {
        const lienRelevePresence = await row.$("td:nth-child(4) a");
        if (lienRelevePresence) {
          await lienRelevePresence.click();
          await page.waitForTimeout(3000);

          const isPresenceOpen = await page.evaluate(() => {
            const setPresenceSpan = document.querySelector(
              "span#set-presence"
            ) as HTMLElement | null;
            return (
              setPresenceSpan?.textContent?.includes("Valider la présence") ||
              false
            );
          });

          if (isPresenceOpen) {
            logger.debug("L'appel est ouvert");
          } else {
            logger.debug("L'appel est fermé");
          }

          currentCourseFound = true;
          break;
        } else {
          logger.error(
            "Lien de relevé de présence non trouvé pour le cours actuel."
          );
        }
      }
    }

    await page.waitForTimeout(10000);

    if (!currentCourseFound) {
      logger.debug("Aucun cours n'a lieu actuellement.");
    }
  } catch (error) {
    logger.error("Une erreur s'est produite :", error);
  } finally {
    await browser.close();
    logger.debug("Fermeture du navigateur.");
  }
}
