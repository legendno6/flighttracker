import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchAircraftPhoto } from '../server/aircraftPhotoCore';

/**
 * Production deployment target: Vercel serverless functions (files under
 * /api become endpoints automatically, no config needed). No API key or
 * environment variable is needed for planespotters.net.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const icao24 = typeof req.query.icao24 === 'string' ? req.query.icao24 : null;
  const { status, body } = await fetchAircraftPhoto(icao24);

  res.status(status).setHeader('Content-Type', 'application/json').send(body);
}
