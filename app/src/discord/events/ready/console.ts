import { Client, Events } from "discord.js";
import { CommandKit } from "commandkit";

export default async (
  c: Client<true>,
  client: Client<true>,
  handler: CommandKit
) => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.user?.setActivity("surveiller les groupes !");
};
