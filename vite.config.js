import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages friendly: relative base
export default defineConfig({
  plugins: [react()],
  // Repo name: pacing-forecaster
  // GitHub Pages URL: https://<user>.github.io/pacing-forecaster/
  base: '/pacing-forecaster/'
})
