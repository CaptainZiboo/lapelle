import { collection } from "discord.js";

declare module "discord.js" {
  export interface client {
    commands: collection<unknown, any>;
  }
}
