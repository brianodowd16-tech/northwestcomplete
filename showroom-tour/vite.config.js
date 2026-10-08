import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built tour can live in any folder, e.g. odowdscarrick.com/tour/
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
