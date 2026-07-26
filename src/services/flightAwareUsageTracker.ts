// Same-origin proxy — see server/flightAwareCore.ts for why this can't call
// AeroAPI directly from the browser (no CORS headers on their responses).
const PROXY_URL = '/api/flightaware-usage';

export interface FlightAwareUsageSnapshot {
  totalCalls: number;
  totalCost: number;
  fetchedAt: string; // ISO 8601
}

// Real AeroAPI response shape (confirmed by calling the endpoint directly,
// not assumed from docs): { total_calls, total_cost, total_pages,
// total_discount_cost, total_successful_calls, total_failed_calls,
// resource_details: [...] }. Only the two fields the UI needs are read.
interface AeroApiUsageResponse {
  total_calls?: number;
  total_cost?: number;
}

interface AeroApiErrorResponse {
  error?: { title?: string; detail?: string };
}

/**
 * Caches FlightAware AeroAPI's own reported account usage (total calls,
 * total cost) so the app can warn before a self-set spending limit is
 * exceeded. Deliberately holds no opinion about the limit itself, or about
 * when the number "resets" — AeroAPI's own figure is the source of truth,
 * refreshed periodically (see useFlightAwareUsagePolling), never locally
 * tallied the way MonthlyRequestBudget tallies AviationStack's request count.
 */
export class FlightAwareUsageTracker {
  private snapshot: FlightAwareUsageSnapshot | null = null;
  private fetchError: string | null = null;

  get current(): FlightAwareUsageSnapshot | null {
    return this.snapshot;
  }

  get lastError(): string | null {
    return this.fetchError;
  }

  /** False (fail-open) until a successful fetch has actually happened. */
  isOverLimit(limitDollars: number): boolean {
    if (!this.snapshot) return false;
    return this.snapshot.totalCost >= limitDollars;
  }

  async refresh(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(PROXY_URL, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      this.fetchError =
        err instanceof Error && err.name === 'TimeoutError'
          ? 'FlightAware usage request timed out.'
          : 'Could not reach the FlightAware proxy.';
      return;
    }

    let body: AeroApiUsageResponse & AeroApiErrorResponse;
    try {
      body = (await response.json()) as AeroApiUsageResponse & AeroApiErrorResponse;
    } catch {
      this.fetchError = `FlightAware usage proxy returned an unreadable response (HTTP ${response.status}).`;
      return;
    }

    if (body.error) {
      this.fetchError = `FlightAware error: ${body.error.detail ?? body.error.title ?? 'Unknown error'}`;
      return;
    }
    if (!response.ok || typeof body.total_calls !== 'number' || typeof body.total_cost !== 'number') {
      this.fetchError = `FlightAware usage returned HTTP ${response.status}.`;
      return;
    }

    this.snapshot = {
      totalCalls: body.total_calls,
      totalCost: body.total_cost,
      fetchedAt: new Date().toISOString(),
    };
    this.fetchError = null;
  }
}
