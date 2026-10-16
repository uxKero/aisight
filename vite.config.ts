import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 4890, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/design/**'] } },
  envPrefix: ['VITE_', 'TAURI_'],
})
