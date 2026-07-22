import type { Plugin } from 'vite';
import { fetchAircraftPhoto } from './aircraftPhotoCore';

/** Serves /api/aircraftPhoto during `vite dev` so local development doesn't need a separate server process. */
export function aircraftPhotoDevProxyPlugin(): Plugin {
  return {
    name: 'aircraft-photo-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/aircraftPhoto', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://internal');
        const icao24 = url.searchParams.get('icao24');
        const { status, body } = await fetchAircraftPhoto(icao24);

        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
