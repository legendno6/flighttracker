import type { Plugin } from 'vite';
import { fetchOpenSkyFlightTrack, fetchOpenSkyPosition } from './openSkyCore';

/** Serves /api/opensky during `vite dev` so local development doesn't need a separate server process. */
export function openSkyDevProxyPlugin(): Plugin {
  return {
    name: 'opensky-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/opensky', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://internal');
        const params = url.searchParams;

        const { status, body } =
          params.get('mode') === 'track'
            ? await fetchOpenSkyFlightTrack(
                params.get('callsign'),
                params.get('departureIcao'),
                params.get('arrivalIcao'),
                params.get('date'),
              )
            : await fetchOpenSkyPosition(params.get('callsign'));

        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
