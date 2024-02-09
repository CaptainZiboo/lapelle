import chalk from "chalk";
export const colors = {
  green: (text: string) => `${chalk.green(text)}`,
  red: (text: string) => `${chalk.red(text)}`,
};
