import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchAviationStackFlight } from '../server/aviationStackCore';

/**
 * Production deployment target: Vercel serverless functions (files under
 * /api become endpoints automatically, no config needed). No environment
 * variable needed here — the AviationStack key comes from the browser's
 * own Settings on every request, same as it did calling AviationStack
 * directly; this just relays it over the one hop that has to stay HTTP.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const searchParams = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  );

  const { status, body } = await fetchAviationStackFlight(searchParams);

  res.status(status).setHeader('Content-Type', 'application/json').send(body);
}
