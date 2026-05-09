const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const tailwindcss = require('@tailwindcss/vite').default;
const path = require('path');

function readNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const frontendDevPort = readNumber(process.env.VITE_DEV_PORT, 5173);
const backendPort = readNumber(process.env.PORT, 8787);
const apiBaseUrl = (process.env.VITE_API_URL || '').replace(/\/$/, '');
const backendOrigin = apiBaseUrl || `http://localhost:${backendPort}`;

module.exports = defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react(), tailwindcss()],
  server: {
    port: frontendDevPort,
    proxy: {
      '/api': backendOrigin,
      '/screenshots': backendOrigin,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'frontend', 'dist'),
    emptyOutDir: true,
  },
});
