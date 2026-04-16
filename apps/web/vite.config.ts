import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: {
          '/api': {
            target: env.API_URL,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
          '/ws': {
            target: env.WS_URL,
            ws: true,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/ws/, ''),
          },
        },
      },
  }
})
