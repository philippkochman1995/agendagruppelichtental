import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH: the folder the site is published under (GitHub Pages: /agendagruppelichtental/); locally /
export default defineConfig({
  base: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BASE_PATH ?? '/',
  plugins: [react()],
})
