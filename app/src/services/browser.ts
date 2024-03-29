import puppeteer, { Browser as PuppeteerBrowser } from "puppeteer";
import { logger } from "../core/utils/logger";

export class BrowserCallbackOptions {
  error?: Error;
}

export class Browser {
  private instance?: PuppeteerBrowser;
  private queue: ((options?: BrowserCallbackOptions) => Promise<any>)[] = [];
  private processing: boolean = false;
  private closing: boolean = false;
  private retries: number = 0;

  async launch() {
    this.instance = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
      protocolTimeout: 0,
    });
  }

  async use<T>(callback: () => Promise<T | undefined>): Promise<T | undefined> {
    // If browser has not been defined, throw error
    if (this.closing || !this.instance || !this.instance.connected) {
      try {
        await this.launch();
        this.closing = false;
      } catch (error: any) {
        logger.error("Error from browser.use");
        logger.error(error.stack);
        throw new Error("Could not launch browser!");
      }
    }

    // Push callback to queue and return promise
    return new Promise(async (resolve, reject) => {
      this.queue.push(async (options?: BrowserCallbackOptions) => {
        // If browser has been force closed, reject callback
        if (options?.error) {
          reject(options.error);
        }

        // Execute callback and resolve result
        try {
          const result = await callback();
          resolve(result);
        } catch (error) {
          reject(error);
        }
        // Add a return statement to fix the problem
      });

      // If browser is not processing, start processing queue
      if (!this.processing) {
        await this.process();
      }
    });
  }

  async process() {
    try {
      if (this.queue.length) {
        this.processing = true;
        const callback = this.queue.shift();
        try {
          await callback?.();
        } finally {
          await this.process();
        }
      } else {
        this.processing = false;
      }
      this.retries = 0;
    } catch (error: any) {
      logger.error("Error from browser.process");
      logger.error(error.stack);
      if (
        error.message.includes("Network.enable timed out") &&
        this.retries <= 3
      ) {
        this.retries++;
        logger.error(
          `Network.enable timed out => Restarting browser (${this.retries})`
        );

        try {
          await this.close();
          await this.launch();
          await this.process();
        } catch (error: any) {
          logger.error("Error from browser.process retry");
          logger.error(error.stack);
          throw new Error("Could not process queue...");
        }
      } else {
        this.retries = 0;
        throw error;
      }
    }
  }

  async close(options?: { force?: boolean }) {
    this.closing = true;
    if (this.queue.length) {
      if (options?.force) {
        for (const callback of this.queue) {
          callback({ error: new Error("BrowserShutdown") });
        }
      } else {
        await Promise.all(this.queue);
      }
    }
    await this.instance?.close();
    this.closing = false;
  }

  async page() {
    if (!this.instance) {
      throw new Error("Browser has not been defined !");
    }

    return this.instance.newPage();
  }
}

export const browser = new Browser();
