import { defineConfig } from "commandkit";

export default defineConfig({
  src: "src",
  main: "index.mjs",
  outDir: "build",
  minify: true,
  antiCrash: true,
});
