import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve("./test"),
  server: { port: 8080, open: "/" },
});
