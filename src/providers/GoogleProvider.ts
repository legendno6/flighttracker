import { ProviderUnavailableError, type FlightLookupRequest, type FlightProvider } from './FlightProvider';

/**
 * Placeholder implementing the FlightProvider interface for parity with the
 * original spec, which called for scraping Google's flight info panel.
 *
 * This is intentionally non-functional, for two reasons:
 *
 * 1. Technical: a browser page cannot fetch google.com/search from
 *    client-side JavaScript — Google's servers don't send CORS headers
 *    permitting cross-origin reads, so the response body is invisible to
 *    this app's own code no matter how the request is made.
 * 2. Policy: even a server-side scraper that sidesteps CORS would violate
 *    Google's Terms of Service (automated querying/scraping of Search is
 *    prohibited), and would be fragile — Google's result markup isn't a
 *    documented, stable contract and changes without notice.
 *
 * It's kept here so the provider chain can reference it, and so a future,
 * compliant replacement (e.g. a licensed data feed) only has to implement
 * this same interface — no UI or business-logic changes required.
 */
export class GoogleProvider implements FlightProvider {
  readonly id = 'google';
  readonly displayName = 'Google Search (unsupported)';

  isConfigured(): boolean {
    return false;
  }

  async lookupFlight(_request: FlightLookupRequest): Promise<never> {
    throw new ProviderUnavailableError(
      'Google Search scraping is not available: it is blocked by CORS from the browser and prohibited by Google\'s Terms of Service from a server. Use AviationStack or OpenSky instead.',
    );
  }
}
