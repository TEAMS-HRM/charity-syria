import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/platform": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/organizations": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
