import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}', '../supabase/functions/**/*.test.ts', '../supabase/templates/**/*.test.ts'],
  },
});
