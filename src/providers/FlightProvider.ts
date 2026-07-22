import type { FlightLookupResult } from '../types/flight';
import type { NormalizedFlightNumber } from '../types/flight';

export interface FlightLookupRequest {
  normalized: NormalizedFlightNumber;
  flightDate: string; // yyyy-mm-dd
}

/** Thrown when a provider understood the request but has no data for it. */
export class FlightNotFoundError extends Error {
  constructor(message = 'No flight found matching that number and date.') {
    super(message);
    this.name = 'FlightNotFoundError';
  }
}

/** Thrown when a provider can't be used at all (missing config, unsupported, etc). */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** Thrown when a provider's quota/rate limit has been exhausted. */
export class ProviderRateLimitError extends Error {
  constructor(message = 'Provider rate limit reached.') {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

/** Thrown on network failures / timeouts talking to a provider. */
export class ProviderNetworkError extends Error {
  constructor(message = 'Network error contacting flight data provider.') {
    super(message);
    this.name = 'ProviderNetworkError';
  }
}

export interface ProviderAttempt {
  providerName: string;
  message: string;
}

/**
 * Thrown when every provider in the resolved chain was tried and none
 * produced a result. Carries a per-provider breakdown so the UI can show
 * exactly what was attempted and why each one failed, instead of only the
 * last error (which would otherwise hide, e.g., that AviationStack and
 * SerpApi were never even tried because only OpenSky is configured).
 */
export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: ProviderAttempt[]) {
    super(
      attempts.length > 0
        ? `All enabled providers failed: ${attempts.map((a) => `${a.providerName} (${a.message})`).join('; ')}`
        : 'No provider was available to try.',
    );
    this.name = 'AllProvidersFailedError';
  }
}

/** Short, provider-agnostic summary of an error — used to build the per-attempt breakdown above. */
export function describeErrorShort(err: unknown): string {
  if (err instanceof FlightNotFoundError) return 'no matching flight';
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

/**
 * Common interface every flight data source implements. The UI and business
 * logic layers only ever talk to this interface — swapping or adding a
 * provider (FlightAware, FlightRadar24, AviationStack, OpenSky, ...) never
 * requires touching components or hooks.
 */
export interface FlightProvider {
  /** Stable machine name, e.g. "aviationstack". */
  readonly id: string;
  /** Human-readable name for diagnostics/settings UI. */
  readonly displayName: string;

  /** Whether this provider currently has what it needs (API keys, etc). */
  isConfigured(): boolean;

  /**
   * Look up a single flight. Should throw FlightNotFoundError,
   * ProviderUnavailableError, ProviderRateLimitError, or ProviderNetworkError
   * rather than returning null, so callers can distinguish failure modes.
   */
  lookupFlight(request: FlightLookupRequest): Promise<FlightLookupResult>;
}
