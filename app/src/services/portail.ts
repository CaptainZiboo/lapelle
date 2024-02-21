import { ElementHandle } from "puppeteer";
import { logger } from "../core/utils/logger";
import { getDateFromString, getDay } from "../core/utils/datetime";
import {
  InvalidEmail,
  InvalidPassword,
  MissingCredentials,
} from "../core/utils/errors";
import { Scraper } from "./scraper";
import { User } from "../core/database/entities";
import { verify } from "../core/utils/jwt";

export interface Presence {
  time: {
    beginning: Date;
    end: Date;
  };
  subject: string;
  teacher: string;
  url: string;
}

export type Status = "open" | "closed" | "not-started";
export interface PresenceStatus extends Presence {
  status: Status;
}

export interface Course {
  _id: string;
  time: {
    beginning: Date;
    end: Date;
  };
  subject: string;
  teachers: string[];
  rooms: string[];
  campus: string[];
  groups: string[];
  zoom?: string;
}

export interface Week {
  meta: {
    start: Date;
    end: Date;
  };
  days: {
    courses: Course[];
    meta: {
      date: Date;
    };
  }[];
}

export interface PortailCredentials {
  email: string;
  password: string;
}

export interface PortailOptions {
  credentials?: PortailCredentials;
  keepOpen?: boolean;
}

export class Portail extends Scraper {
  private credentials: PortailCredentials;
  private loggedIn: boolean = false;
  private keepOpen: boolean = false;

  constructor(private user: User, options?: PortailOptions) {
    super();
    const credentials = verify(this.user.credentials) || options?.credentials;

    if (!credentials) {
      throw new MissingCredentials();
    }

    this.credentials = credentials;
    this.keepOpen = options?.keepOpen || false;
  }

  // Méthode pour initialiser le navigateur
  async initialize() {
    await this.create();

    if (!this.page) {
      logger.error("Page has not initialized.");
      return;
    }

    await this.navigate({
      url: "https://www.leonard-de-vinci.net/",
      timeout: 10000,
    });
  }

  async use<T = any>(
    callback?: (portail: Portail) => Promise<T | undefined>
  ): Promise<T | undefined> {
    return this.browser.use<T | undefined>(async () => {
      try {
        if (!this.loggedIn) {
          await this.initialize();
          await this.login();
        }
        const value = await callback?.(this);
        return value;
      } catch (error: any) {
        logger.error("Error from portail.use");
        logger.error(error.stack);
        // Throwing error to browser
        throw error;
      } finally {
        if (!this.keepOpen) {
          await this.close();
        }
      }
    });
  }

  // Méthode pour effectuer le login
  async login() {
    const { email, password } = this.credentials;

    if (!this.page) {
      logger.error("Page has not initialized.");
      return;
    }

    const login = await this.find("#login");

    if (!login) {
      return; // Already logged in
    }

    // Fill login field on first login page
    await this.input("#login", email);

    // Try to redirect to SSO login page
    const isEmailValid = await this.navigate({
      click: "#btn_next",
      timeout: 8000,
      safe: true,
      validate: (url) => url.startsWith("https://adfs.devinci.fr/adfs/ls"),
    });

    // Check if redirection has been done
    if (!isEmailValid) {
      if (this.credentials) throw new InvalidEmail();
      else throw new Error();
    }

    // Fill fields in SSO login page
    await this.input("#userNameInput", email);
    await this.input("#passwordInput", password);

    // End up login and go to main page
    const isPasswordValid = await this.navigate({
      click: "#submitButton",
      timeout: 10000,
      safe: true,
      validate: (url) => url === "https://www.leonard-de-vinci.net/",
    });

    if (!isPasswordValid) {
      if (this.credentials) throw new InvalidPassword();
      else throw new Error();
    }
  }

  // Méthode principale pour obtenir les informations
  async getPresences(): Promise<Presence[]> {
    if (!this.page) {
      throw new Error("Page has not initialized.");
    }

    await this.navigate({
      url: "https://www.leonard-de-vinci.net/student/presences/",
    });

    // Getting all day course
    const presences = await this.getAll("#body_presences tr");

    const courses: Presence[] = await Promise.all(
      presences.map((presence) => this.getPresenceData(presence))
    );

    return courses;
  }

  async getPresence(course: Course): Promise<PresenceStatus | undefined> {
    const presences = await this.getPresences();

    const current = presences.find(
      (presence) =>
        presence.subject === course.subject &&
        presence.time.beginning.getTime() === course.time.beginning.getTime() &&
        presence.time.end.getTime() === course.time.end.getTime()
    );
    if (!current) {
      return;
    }

    await this.navigate({ url: current.url, timeout: 10000 });

    const element = await this.get("#body_presence");

    if (!element) {
      return;
    }

    const status: Status = await element.evaluate(() => {
      const danger = document.querySelector(".danger.alert-danger");

      const success = document.querySelector(".success.alert-success");
      if (success?.textContent?.includes("avez été noté présent")) {
        if (danger?.textContent?.includes("L'appel est clôturé")) {
          return "closed";
        } else {
          return "open";
        }
      }

      if (danger?.textContent?.includes("pas encore ouvert")) {
        return "not-started";
      } else if (danger) {
        return "closed";
      }

      const validate = document.querySelector("span#set-presence");
      if (validate?.textContent?.includes("Valider la présence")) return "open";

      return "closed";
    });

    return {
      ...current,
      status,
    };
  }

  async getPresenceData(course: ElementHandle): Promise<Presence> {
    const time = await course.$eval("td:nth-child(1)", (el) =>
      el.textContent ? el.textContent.trim().replace(/\s+/g, "") : ""
    );

    const subject = await course.$eval("td:nth-child(2)", (el) =>
      el.textContent ? el.textContent.trim() : ""
    );

    const teacher = await course.$eval("td:nth-child(3)", (el) =>
      el.textContent ? el.textContent.trim() : ""
    );

    const url = await course.$eval("td:nth-child(4) a", (el) => el.href || "");

    // Get course beginning / end times
    const [beginning, end] = time.split("-");
    const beginningTime = getDateFromString(beginning);
    beginningTime.setSeconds(0, 0);
    const endTime = getDateFromString(end);
    endTime.setSeconds(0, 0);

    return {
      time: {
        beginning: beginningTime,
        end: endTime,
      },
      subject,
      teacher,
      url,
    };
  }

  async getCourseData(el: ElementHandle<Element>): Promise<Course> {
    // Cliquez sur le cours pour ouvrir la fenêtre modale
    await el.click();

    // Attendez que la fenêtre modale soit ouverte
    const modal = await this.get("#b-calendar-1-event-tip");

    if (!modal) {
      throw new Error("La fenêtre modale n'a pas pu être trouvée.");
    }

    const info = await modal.$(".b-eventtip-content");

    if (!info) {
      throw new Error("Les informations n'ont pas pu être trouvées.");
    }

    const campus = await info?.$eval(
      "dd:nth-child(6)",
      (el) => el.textContent?.trim() || ""
    );

    const teachers = await info.$eval(
      "dd:nth-child(8)",
      (el) => el.textContent?.trim() || ""
    );

    const groups = await modal.$eval(
      "dd:nth-child(10)",
      (el) => el.textContent?.trim() || ""
    );

    const link = await this.get("dd:nth-child(12) a", {
      parent: modal,
      safe: true,
    });
    const zoom = await link?.evaluate(
      (el) => el.getAttribute("href") || undefined
    );

    // Fermez la fenêtre modale
    await modal.$eval("button[data-ref='close']", (button) => button.click());

    // General data about the course
    const _id = await el.evaluate(
      (el) => el.getAttribute("data-event-id") || ""
    );
    const beginning = await el.$eval(
      ".b-event-time",
      (time: Element) => time.textContent || ""
    );
    const beginningTime = getDateFromString(beginning);
    beginningTime.setSeconds(0, 0);

    const end = await el.$eval(
      ".b-cal-event-desc-complex > div",
      (time: Element) => time.textContent || ""
    );
    const endTime = getDateFromString(end);
    endTime.setSeconds(0, 0);

    const subject = await el.$eval(
      ".b-event-name",
      (name: Element) => name.textContent?.replace(/\s*\[.*?\]$/, "") || ""
    );
    const rooms = await el.$eval(
      ".b-cal-event-desc-complex > span:last-child",
      (span: Element) => span.textContent || ""
    );

    return {
      _id,
      time: {
        beginning: beginningTime,
        end: endTime,
      },
      subject,
      teachers: teachers.split(",").map((v) => v.trim()),
      rooms: rooms.split(",").map((v) => v.trim()),
      campus: campus.split(",").map((v) => v.trim()),
      groups: groups.split(",").map((v) => v.trim()),
      zoom,
    };
  }

  async getWeekCourses(): Promise<Week | undefined> {
    if (!this.page) {
      throw new Error("Page has not initialized.");
    }

    // Navigate to the calendar page
    await this.navigate({
      url: "https://www.leonard-de-vinci.net/?my=edt",
      timeout: 10000,
    });

    await this.find(".b-dayview-day-detail", { timeout: 0 });

    // Récupérer les jours sur l'emploi du temps
    const days = await this.page.$$(".b-dayview-day-detail");

    // Vérifier si les jours ont été trouvés
    if (!days || !days.length) {
      throw new Error("NoDaysFound");
    }

    // Récupérer la date de début
    const start = await days[0].evaluate((day) =>
      day.getAttribute("data-date")
    );

    // Récupérer la date de fin
    const end = await days[days.length - 1].evaluate((day) =>
      day.getAttribute("data-date")
    );

    // Vérifier si les dates ont été trouvées
    if (!start || !end) {
      throw new Error("NoDatesFound");
    }

    // Initialiser l'objet de la semaine
    const week: Week = {
      days: [],
      meta: {
        start: new Date(start),
        end: new Date(end),
      },
    };

    for (const day of days) {
      // Récupérer la date du jour
      const date = await day.evaluate((day) => day.getAttribute("data-date"));

      if (!date) {
        throw new Error("NoDateFound");
      }

      // Sélectionner tous les cours pour le jour donné
      const courses = await day.$$(".b-cal-event-wrap");
      const dayCourses: Course[] = [];

      for (const course of courses) {
        const data = await this.getCourseData(course);
        dayCourses.push(data);
      }

      week.days.push({
        courses: dayCourses,
        meta: {
          date: new Date(date),
        },
      });
    }

    return week;
  }

  async getTodayCourses(): Promise<Course[]> {
    if (!this.page) {
      throw new Error("Page has not initialized.");
    }

    // Navigate to the calendar page
    await this.navigate({
      url: "https://www.leonard-de-vinci.net/?my=edt",
      timeout: 10000,
    });

    // Récupérer les jours sur l'emploi du temps
    const days = await this.page.$$(".b-dayview-day-detail");

    const index = getDay(new Date()).index;

    // Sélectionner tous les cours pour le jour donné
    const courses = await days[index].$$(".b-cal-event-wrap");

    const data = [];

    for (const course of courses) {
      const c = await this.getCourseData(course);
      data.push(c);
    }

    return data;
  }

  async getGroups(): Promise<string[] | undefined> {
    await this.navigate({
      url: "https://www.leonard-de-vinci.net/?my=fiche",
      timeout: 10000,
    });

    if (!this.page) {
      throw new Error("Page has not initialized.");
    }

    const panel = await this.page.$(
      "::-p-xpath(//*[text()='Mes groupes']/parent::*/parent::*)"
    );

    if (!panel) {
      throw new Error("Impossible de trouver le panel des groupes.");
    }

    const groups = await this.page.$$(
      "::-p-xpath(//*[text()='Mes groupes']/parent::*/parent::*//div[contains(@class, 'active') and not(ancestor::div[contains(@class, 'tab-pane')])]//div[contains(@class, 'accordion-heading')])"
    );

    const list = await Promise.all(
      groups.map(async (group) =>
        group.evaluate((el) => el.textContent?.trim() || "")
      )
    );

    return list;
  }

  // Méthode pour fermer la page
  async close() {
    if (this.page) {
      this.page.close();
    }
  }
}
