/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { EXT_NAME, EXT_TITLE, EXT_VERSION } from "./src/constants.ts";

/**
 * Where the built site will live. GitHub Pages project sites are served from
 * "/<repo-name>/", so the deploy workflow sets BASE_PATH accordingly. Every URL
 * in the Owlbear manifest is prefixed with it so the extension works no matter
 * which sub-path it is hosted under.
 */
const rawBase = process.env.BASE_PATH ?? "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

function owlbearManifest(): Plugin {
  const manifest = () =>
    JSON.stringify(
      {
        name: EXT_NAME,
        version: EXT_VERSION,
        manifest_version: 1,
        description:
          "Link tokens to D&D Beyond characters and monsters, view live character sheets, roll from the sheet, and pull encounters from the D&D Beyond Encounter Builder.",
        author: "DDB-OBR",
        icon: `${base}icon.svg`,
        background_url: `${base}background.html`,
        action: {
          title: EXT_TITLE,
          icon: `${base}icon.svg`,
          popover: `${base}index.html`,
          width: 420,
          height: 640,
        },
      },
      null,
      2,
    );
  return {
    name: "owlbear-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === `${base}manifest.json`) {
          res.setHeader("Content-Type", "application/json");
          res.end(manifest());
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: manifest() });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), owlbearManifest()],
  server: {
    // Owlbear Rodeo fetches the manifest and loads our pages from its own origin.
    cors: { origin: ["https://www.owlbear.rodeo", "https://owlbear.rodeo"] },
  },
  build: {
    rollupOptions: {
      input: {
        main: page("index.html"),
        sheet: page("sheet.html"),
        link: page("link.html"),
        background: page("background.html"),
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
