import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { ipfsPinPlugin } from "./vite-plugin-ipfs-pin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), ipfsPinPlugin(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
