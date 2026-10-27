import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Reine Frontend-App (kein Backend).
// base:
//   - lokal (npm run dev / preview):           "/"      -> http://localhost:8080
//   - GitHub Pages (Projekt-Repo, im Actions): "/<repo>/"  via VITE_BASE_PATH
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: true,
    host: true,
  },
});
