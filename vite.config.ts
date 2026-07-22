import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config as loadDotenv } from 'dotenv';
import { flightAwareDevProxyPlugin } from './server/viteFlightAwareProxyPlugin';
import { openSkyDevProxyPlugin } from './server/viteOpenSkyProxyPlugin';
import { aircraftPhotoDevProxyPlugin } from './server/viteAircraftPhotoProxyPlugin';

// Populates process.env from .env for the dev-server-side proxies (Vite only
// exposes VITE_-prefixed vars to client code via import.meta.env; this is
// for the Node-side plugins, which read process.env directly).
loadDotenv();

export default defineConfig({
  plugins: [react(), flightAwareDevProxyPlugin(), openSkyDevProxyPlugin(), aircraftPhotoDevProxyPlugin()],
  server: {
    port: 5173,
  },
});
