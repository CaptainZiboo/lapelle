import puppeteer, { ElementHandle, Page } from "puppeteer";
import { Browser, browser } from "./browser";
import { logger } from "../core/utils/logger";

export interface ParserGetOptions {
  parent?: ElementHandle;
  safe?: boolean;
}

export class Scraper {
  public page?: Page;
  public browser: Browser = browser;

  constructor() {}

  async create() {
    this.page = await this.browser.page();
  }

  async find(
    selector: string,
    options: {
      timeout?: number;
      callback?: (exists: boolean) => void | Promise<void>;
    } = {}
  ) {
    if (!this.page) {
      throw new Error("Page has not been defined !");
    }
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await options?.callback?.(true);
      return true;
    } catch (error) {
      await options?.callback?.(false);
      return false;
    }
  }

  async get(
    selector: string,
    options: ParserGetOptions = {}
  ): Promise<ElementHandle | undefined> {
    return new Promise(async (resolve, reject) => {
      try {
        const target = options.parent ? options.parent : this.page;
        if (!target) {
          reject("Parent element or page is not available.");
          return;
        }

        const elementHandle = await target.$(selector);
        if (elementHandle) {
          resolve(elementHandle);
        } else {
          if (options.safe) {
            resolve(undefined);
          } else {
            reject(
              `L'élément correspondant au sélecteur ${selector} est nul ou indéfini.`
            );
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAll(
    selector: string,
    options?: { limit?: number }
  ): Promise<ElementHandle[]> {
    return new Promise(async (resolve, reject) => {
      await this.find(selector, {
        callback: async (exists) => {
          if (exists) {
            try {
              let elements = await this.page?.$$(selector);

              if (elements) {
                elements = elements.filter(Boolean); // Filtrer les résultats nuls ou indéfinis

                if (options?.limit) {
                  elements = elements.slice(0, options.limit);
                }

                resolve(elements);
              } else {
                reject(
                  `La liste d'éléments correspondant au sélecteur ${selector} est nulle ou indéfinie.`
                );
              }
            } catch (error) {
              reject(error);
            }
          } else {
            reject(`Le sélecteur ${selector} n'a pas été trouvé.`);
          }
        },
      });
    });
  }

  async input(selector: string, value: string) {
    await this.find(selector, {
      callback: async (exists) => {
        if (exists) {
          // Sélecteur trouvé, remplir l'input
          await this.page?.$eval(
            selector,
            (input, value) => {
              (input as HTMLInputElement).value = value;
            },
            value
          );

          // Attendre que la valeur de l'input soit mise à jour
          await this.page?.waitForFunction(
            (selector, expected) => {
              const input = document.querySelector(
                selector
              ) as HTMLInputElement;
              return input && input.value === expected;
            },
            {},
            selector,
            value
          );
        } else {
          logger.error(`Le sélecteur ${selector} n'a pas été trouvé.`);
        }
      },
    });
  }

  async navigate(options: {
    url?: string;
    click?: string;
    timeout?: number;
    safe?: boolean;
    validate?: (url: string) => boolean | Promise<boolean>;
  }) {
    try {
      if (!this.page) {
        throw new Error("Page has not initialized.");
      }

      let navigation;

      if (options.url) {
        navigation = this.page.goto(options.url);
      } else if (options.click) {
        navigation = this.page.click(options.click);
      } else {
        throw new Error(
          "Neither URL nor click selector provided for navigation."
        );
      }

      await Promise.all([
        navigation,
        this.page.waitForNavigation({ timeout: options.timeout || 10000 }),
      ]);

      if (options.validate) {
        const location = this.page.url();
        const redirected = await options.validate(location);
        if (!redirected) {
          throw new Error(`Impossible de valider l'URL: ${location}`);
        }
      }

      return true;
    } catch (error) {
      if (options.safe) {
        return false;
      } else {
        throw error;
      }
    }
  }
}
