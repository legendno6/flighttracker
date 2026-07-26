import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFlightAwareUsage } from '../server/flightAwareCore';

/**
 * Production deployment target: Vercel serverless functions (files under
 * /api become endpoints automatically, no config needed). Reuses the same
 * FLIGHTAWARE_API_KEY environment variable as api/flightaware.ts.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { status, body } = await fetchFlightAwareUsage();

  res.status(status).setHeader('Content-Type', 'application/json').send(body);
}
