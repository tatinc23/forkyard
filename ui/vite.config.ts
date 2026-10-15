import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const shared = decodeURIComponent(new URL("../src/shared", import.meta.url).pathname);

// GADGETHUB_API=https://gadgethub.chris-d6a.workers.dev npm run dev  -> use the deployed backend
const api = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GADGETHUB_API ?? "http://127.0.0.1:8787";

export default defineConfig({
	plugins: [react()],
	resolve: { alias: { "@shared": shared } },
	build: { outDir: "../public", emptyOutDir: true, target: "es2022", sourcemap: false },
	server: {
		port: 5173,
		fs: { allow: [".."] },
		// Run `wrangler dev` (port 8787) next to this to use the real API.
		proxy: { "/api": { target: api, ws: true, changeOrigin: true }, "/preview": { target: api, changeOrigin: true } },
	},
});
