import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';
import express, { type Request, type Response } from 'express';
import { fetchFlightAwareFlight } from './flightAwareCore';
import { fetchOpenSkyFlightTrack, fetchOpenSkyPosition } from './openSkyCore';
import { fetchAircraftPhoto } from './aircraftPhotoCore';

/**
 * Standalone production server for deployments that aren't Vercel (e.g. a
 * Raspberry Pi on the local network) — serves the built static app
 * (`npm run build`'s `dist/`) and the same three proxy endpoints the Vite
 * dev server and Vercel functions expose, all from one Node process on one
 * port. The actual proxy logic lives in the `*Core.ts` files and is shared
 * unchanged across all three deployment targets; this file is just a third
 * way of wiring them up.
 */

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const port = Number(process.env.PORT) || 3000;
// Bind to every network interface (not just localhost) so other devices on
// the LAN can reach it, e.g. http://<pi-ip-address>:3000.
const host = '0.0.0.0';

function stringParam(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const app = express();

app.get('/api/flightaware', async (req: Request, res: Response) => {
  const ident = stringParam(req.query.ident);
  const searchParams = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
  );
  const { status, body } = await fetchFlightAwareFlight(ident, searchParams);
  res.status(status).setHeader('Content-Type', 'application/json').send(body);
});

app.get('/api/opensky', async (req: Request, res: Response) => {
  const callsign = stringParam(req.query.callsign);
  const { status, body } =
    stringParam(req.query.mode) === 'track'
      ? await fetchOpenSkyFlightTrack(
          callsign,
          stringParam(req.query.departureIcao),
          stringParam(req.query.arrivalIcao),
          stringParam(req.query.date),
        )
      : await fetchOpenSkyPosition(callsign);
  res.status(status).setHeader('Content-Type', 'application/json').send(body);
});

app.get('/api/aircraftPhoto', async (req: Request, res: Response) => {
  const icao24 = stringParam(req.query.icao24);
  const { status, body } = await fetchAircraftPhoto(icao24);
  res.status(status).setHeader('Content-Type', 'application/json').send(body);
});

app.use(express.static(distDir));

// SPA fallback: broadcast mode and any other direct navigation still resolve to the same index.html.
// A path-less middleware (rather than app.get('*', ...)) sidesteps Express 5's
// stricter path-to-regexp wildcard syntax entirely.
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, host, () => {
  console.log(`PlaneStatus serving on http://${host}:${port} (run \`npm run build\` first if this is a fresh checkout)`);
});
