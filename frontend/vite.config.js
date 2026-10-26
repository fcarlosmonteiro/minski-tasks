import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // No docker-compose, API_URL aponta para o contêiner do backend.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:5000" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.js"],
  },
});
