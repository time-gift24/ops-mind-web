import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      "/v1/apis": {
        target: process.env.AI_STREAM_BASE_URL ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  plugins: [tailwindcss(), reactRouter()],
})
