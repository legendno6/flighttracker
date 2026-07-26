import type { Plugin } from 'vite';
import { fetchFlightAwareFlight, fetchFlightAwareUsage } from './flightAwareCore';

/** Serves /api/flightaware and /api/flightaware-usage during `vite dev` so local development doesn't need a separate server process. */
export function flightAwareDevProxyPlugin(): Plugin {
  return {
    name: 'flightaware-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/flightaware-usage', async (_req, res) => {
        const { status, body } = await fetchFlightAwareUsage();

        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });

      server.middlewares.use('/api/flightaware', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://internal');
        const ident = url.searchParams.get('ident');
        const { status, body } = await fetchFlightAwareFlight(ident, url.searchParams);

        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
