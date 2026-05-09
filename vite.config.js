const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const tailwindcss = require('@tailwindcss/vite').default;
const path = require('path');
const { getRuntimeConfig, validateRuntimeConfig } = require('./config');

validateRuntimeConfig();
const config = getRuntimeConfig();
const backendOrigin = config.frontend.apiUrl || `http://localhost:${config.app.port}`;

module.exports = defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react(), tailwindcss()],
  server: {
    port: config.frontend.devPort,
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
