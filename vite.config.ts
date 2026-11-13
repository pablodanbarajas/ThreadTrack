import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Commit desplegado (Vercel expone VERCEL_GIT_COMMIT_SHA al compilar)
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'local'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD__: JSON.stringify(build),
  },
})
