import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFlightAwareFlight } from '../server/flightAwareCore';

/**
 * Production deployment target: Vercel serverless functions (files under
 * /api become endpoints automatically, no config needed). Set
 * FLIGHTAWARE_API_KEY as a Vercel environment variable — see README for
 * deploying to a different platform instead.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ident = typeof req.query.ident === 'string' ? req.query.ident : null;
  const searchParams = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  );

  const { status, body } = await fetchFlightAwareFlight(ident, searchParams);

  res.status(status).setHeader('Content-Type', 'application/json').send(body);
}
