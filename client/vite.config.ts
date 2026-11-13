/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// In dev the API is on :3000; in Docker and production it shares the origin (see nginx.conf).
	server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
	// Node fetch needs an absolute URL; MSW matches relative handlers against the jsdom origin (http://localhost:3000).
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		env: { VITE_API_URL: "http://localhost:3000" },
	},
})
