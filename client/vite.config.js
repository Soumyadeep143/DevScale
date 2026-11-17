import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // The AI job parser shares its pure helper (supabase/functions/ai/parseJobs.ts) with the server function.
    fs: { allow: ['..'] },
  },
})
