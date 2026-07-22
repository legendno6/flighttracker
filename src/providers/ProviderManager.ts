import {
  AllProvidersFailedError,
  ProviderRateLimitError,
  describeErrorShort,
  type FlightLookupRequest,
  type FlightProvider,
  type ProviderAttempt,
} from './FlightProvider';
import { AviationStackProvider } from './AviationStackProvider';
import { FlightAwareProvider } from './FlightAwareProvider';
import { OpenSkyProvider } from './OpenSkyProvider';
import { GoogleProvider } from './GoogleProvider';
import { MockProvider } from './MockProvider';
import { SessionRequestGovernor } from '../services/sessionRequestGovernor';
import { resolveDisplayStatus, statusCategory } from '../services/statusResolver';
import type { AppSettings } from '../types/settings';
import type { FlightLookupResult } from '../types/flight';

const CACHE_TTL_MS = 60_000;

/** OpenSky gives only live position, never gates/terminals/schedules, so it's always tried last and can't be dragged above the richer sources. */
const PINNED_LAST_PROVIDER_ID = 'opensky';

interface CacheEntry {
  result: FlightLookupResult;
  cachedAt: number;
}

/**
 * Orchestrates the FlightProvider chain: AviationStack primary, FlightAware
 * (via a same-origin proxy — see server/flightAwareCore.ts) secondary,
 * OpenSky as a last-resort fallback / live-position enrichment source. The
 * UI never talks to a concrete provider directly — only to this manager —
 * so adding FlightRadar24, AviationEdge, etc. later is a matter of
 * instantiating another FlightProvider here, not touching components or
 * hooks.
 */
export class ProviderManager {
  readonly aviationStack: AviationStackProvider;
  readonly flightAware: FlightAwareProvider = new FlightAwareProvider();
  readonly openSky: OpenSkyProvider = new OpenSkyProvider();
  readonly google: GoogleProvider = new GoogleProvider();
  readonly mock: MockProvider = new MockProvider();
  readonly sessionGovernor: SessionRequestGovernor;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlightRequests = new Map<string, Promise<FlightLookupResult>>();

  constructor(private readonly getSettings: () => AppSettings) {
    this.aviationStack = new AviationStackProvider(
      () => this.getSettings().credentials.aviationStackApiKey,
    );
    this.sessionGovernor = new SessionRequestGovernor(() => this.getSettings().sessionRequestLimit);
  }

  /** Real (non-demo, non-stub) providers a user can select and reorder in Settings. */
  orderableProviders(): FlightProvider[] {
    return [this.aviationStack, this.flightAware, this.openSky];
  }

  /** Providers whose position in the order is user-draggable (everything except the pinned-last ones). */
  reorderableProviders(): FlightProvider[] {
    return this.orderableProviders().filter((p) => p.id !== PINNED_LAST_PROVIDER_ID);
  }

  /** Providers always tried last, regardless of the user's stored order. */
  pinnedLastProviders(): FlightProvider[] {
    return this.orderableProviders().filter((p) => p.id === PINNED_LAST_PROVIDER_ID);
  }

  /** All orderable providers in final priority order (pinned providers forced to the end), regardless of enabled/configured state. */
  private resolveOrderedProviders(): FlightProvider[] {
    const { order } = this.getSettings().providerPreferences;
    const reorderable = this.reorderableProviders();
    const byId = new Map(reorderable.map((p) => [p.id, p]));
    const orderedIds = [...order.filter((id) => byId.has(id)), ...[...byId.keys()].filter((id) => !order.includes(id))];
    const ordered = orderedIds.map((id) => byId.get(id)).filter((p): p is FlightProvider => !!p);
    return [...ordered, ...this.pinnedLastProviders()];
  }

  private cacheKey(request: FlightLookupRequest): string {
    const ident =
      request.normalized.icaoFlightNumber ??
      request.normalized.iataFlightNumber ??
      request.normalized.raw;
    return `${ident}-${request.flightDate}`;
  }

  /** True if a cached (fresh, <1 min old) result exists for this request. */
  hasFreshCache(request: FlightLookupRequest): boolean {
    const entry = this.cache.get(this.cacheKey(request));
    return !!entry && Date.now() - entry.cachedAt < CACHE_TTL_MS;
  }

  async lookupFlight(request: FlightLookupRequest, options?: { bypassCache?: boolean }): Promise<FlightLookupResult> {
    const key = this.cacheKey(request);

    if (!options?.bypassCache) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.result;
      }
    }

    const existing = this.inFlightRequests.get(key);
    if (existing) return existing;

    const promise = this.performLookup(request).finally(() => {
      this.inFlightRequests.delete(key);
    });
    this.inFlightRequests.set(key, promise);

    const result = await promise;
    this.cache.set(key, { result, cachedAt: Date.now() });
    return result;
  }

  private async performLookup(request: FlightLookupRequest): Promise<FlightLookupResult> {
    const settings = this.getSettings();

    if (settings.demoMode) {
      return this.mock.lookupFlight(request);
    }

    if (!this.sessionGovernor.hasRemaining()) {
      throw new ProviderRateLimitError(
        `Session request limit reached (${this.sessionGovernor.limit}). Click Restart next to the limit in Settings to resume.`,
      );
    }

    const { enabled } = settings.providerPreferences;
    const attempts: ProviderAttempt[] = [];

    for (const provider of this.resolveOrderedProviders()) {
      if (enabled[provider.id] === false) {
        attempts.push({ providerName: provider.displayName, message: 'disabled in Settings' });
        continue;
      }
      if (!provider.isConfigured()) {
        attempts.push({ providerName: provider.displayName, message: 'not configured — add credentials in Settings' });
        continue;
      }
      if (!this.sessionGovernor.hasRemaining()) {
        attempts.push({ providerName: provider.displayName, message: 'skipped — session request limit reached' });
        continue;
      }

      try {
        const result = await provider.lookupFlight(request);
        this.sessionGovernor.recordUsage();
        await this.enrichWithLivePosition(result, request);
        await this.enrichWithTrackHistory(result, request);
        return result;
      } catch (err) {
        this.sessionGovernor.recordUsage();
        attempts.push({ providerName: provider.displayName, message: describeErrorShort(err) });
      }
    }

    throw new AllProvidersFailedError(attempts);
  }

  /**
   * Best-effort: if a result has no live position, try filling it in from
   * OpenSky — while the flight is actually in the air (Taxiing/Departed/In
   * Flight/Descending), or (deliberately) while it merely *looks* delayed,
   * so this reliably shows for every in-flight card without wasting
   * requests on flights that clearly haven't reached their departure window
   * yet and would never display it anyway.
   *
   * The 'delayed' case matters because of a chicken-and-egg problem: a real
   * flight that already departed but whose provider hasn't updated its
   * status field or `actual` departure time yet (AviationStack's free tier,
   * especially) resolves to "Delayed" by `resolveDisplayStatus`'s own
   * timestamp heuristic — but that heuristic also trusts a present `live`
   * position as evidence of being airborne, and the only way to get that
   * live position is to actually attempt this enrichment. Gating strictly on
   * an already-"inflight" resolved status would mean this class of flight
   * never gets a chance to correct itself.
   */
  private async enrichWithLivePosition(
    result: FlightLookupResult,
    request: FlightLookupRequest,
  ): Promise<void> {
    const { enabled } = this.getSettings().providerPreferences;
    if (result.live || !this.openSky.isConfigured() || enabled[this.openSky.id] === false) return;
    // `result.status` here is still the raw provider status (e.g. AviationStack's
    // literal flight_status) — the card displays the *resolved* status (which also
    // treats a present `departure.actual` as airborne even when the raw status
    // hasn't caught up yet), so this must check the same resolved category or
    // enrichment silently never fires for exactly the flights the card shows as in-flight.
    const category = statusCategory(resolveDisplayStatus(result));
    if (category !== 'inflight' && category !== 'delayed') return;
    if (!this.sessionGovernor.hasRemaining()) return;

    try {
      this.sessionGovernor.recordUsage();
      // Prefer the provider-confirmed operating callsign over our own
      // marketing-number guess (see OpenSkyProvider.lookupFlight's callsignOverride doc).
      const skyResult = await this.openSky.lookupFlight(request, result.flightIcao);
      result.live = skyResult.live;
    } catch {
      // Enrichment is optional — silently proceed without live position data.
    }
  }

  /**
   * Best-effort: if the primary provider hasn't confirmed an actual
   * departure/arrival time yet, try OpenSky's ADS-B track history for a
   * supplementary confirmation (never overwrites `.actual` — see AirportInfo's
   * `adsbConfirmed` field for why those are kept distinct).
   */
  private async enrichWithTrackHistory(
    result: FlightLookupResult,
    request: FlightLookupRequest,
  ): Promise<void> {
    const { enabled } = this.getSettings().providerPreferences;
    if (!this.openSky.isConfigured() || enabled[this.openSky.id] === false) return;

    // Prefer the provider-confirmed operating callsign over our own
    // marketing-number guess — see enrichWithLivePosition for why.
    const callsign = result.flightIcao ?? request.normalized.icaoFlightNumber;
    if (!callsign) return;

    const needsDeparture = !result.departure.actual && !result.departure.adsbConfirmed && !!result.departure.icaoCode;
    const needsArrival = !result.arrival.actual && !result.arrival.adsbConfirmed && !!result.arrival.icaoCode;
    if (!needsDeparture && !needsArrival) return;
    if (!this.sessionGovernor.hasRemaining()) return;

    try {
      this.sessionGovernor.recordUsage();
      const track = await this.openSky.fetchTrackHistory(
        callsign,
        needsDeparture ? result.departure.icaoCode : null,
        needsArrival ? result.arrival.icaoCode : null,
        result.flightDate,
      );
      if (!track) return;
      if (needsDeparture) result.departure.adsbConfirmed = track.firstSeen;
      if (needsArrival) result.arrival.adsbConfirmed = track.lastSeen;
    } catch {
      // Enrichment is optional — silently proceed without track-history data.
    }
  }

  listProviders(): FlightProvider[] {
    return [this.aviationStack, this.flightAware, this.openSky, this.google, this.mock];
  }
}
