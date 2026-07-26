import type { Plugin } from 'vite';
import { fetchAviationStackFlight } from './aviationStackCore';

/** Serves /api/aviationstack during `vite dev` so local development doesn't need a separate server process. */
export function aviationStackDevProxyPlugin(): Plugin {
  return {
    name: 'aviationstack-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/aviationstack', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://internal');
        const { status, body } = await fetchAviationStackFlight(url.searchParams);

        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
