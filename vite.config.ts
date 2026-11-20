import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The product name lives in one place, the Tauri config. A rename is that one line.
const { productName, version } = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  define: {
    "import.meta.env.VITE_APP_NAME": JSON.stringify(process.env.VITE_APP_NAME ?? productName),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    // A test build says so, and which commit it is: every test build carries the number of the last release.
    "import.meta.env.VITE_BUILD_LABEL": JSON.stringify(process.env.VITE_BUILD_LABEL ?? ""),
  },
});
