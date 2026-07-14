import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  root: './',
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5180
  }
})
