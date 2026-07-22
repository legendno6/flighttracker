import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchOpenSkyFlightTrack, fetchOpenSkyPosition } from '../server/openSkyCore';

function stringParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Production deployment target: Vercel serverless functions. Set
 * OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET as Vercel environment
 * variables — see README for deploying to a different platform instead.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
