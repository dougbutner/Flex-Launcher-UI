import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { flexDbPlugin } from "./vite-plugin-flex-db";
import { githubListingPlugin } from "./vite-plugin-github-listing";
import { ipfsPinPlugin } from "./vite-plugin-ipfs-pin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), ipfsPinPlugin(env), flexDbPlugin(env), githubListingPlugin(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
