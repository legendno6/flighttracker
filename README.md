# PlaneStatus

A real-time commercial flight status dashboard. Add flights by number, watch
them move through boarding, departure, in-flight progress, and landing, with
live gate/terminal/status data pulled from real flight-data providers — plus
a [Broadcast mode](#broadcast-mode) that turns it into a castable, airport-style
split-flap departures board.

## Data providers

The app never talks to a single hardcoded data source — everything goes
through a `FlightProvider` interface (`src/providers/FlightProvider.ts`), so
adding a new source later is a matter of implementing that interface, not
rewriting the UI. The built-in chain, tried in order until one succeeds:

1. **[AviationStack](https://aviationstack.com/)** — airline, aircraft,
   schedule, gate/terminal/baggage, and status. Free tier: 100 requests/month,
   HTTP-only. Key entered in Settings, called directly from the browser.
2. **[FlightAware AeroAPI (Personal)](https://www.flightaware.com/commercial/aeroapi/)**
   — very detailed schedule/gate/terminal/baggage/status data, plus aircraft
   registration. Pay-per-use (no fixed monthly quota), rate-limited to 10
   requests/minute. **Requires the small server-side proxy described below**
   — AeroAPI sends no CORS headers at all, so a browser can never call it
   directly no matter how the client code is written (confirmed by testing:
   requests complete on FlightAware's servers, but the response is invisible
   to JavaScript). The key is set as a `FLIGHTAWARE_API_KEY` environment
   variable read only by the proxy — it never appears in browser network
   traffic, unlike the other providers' keys.
3. **[OpenSky Network](https://opensky-network.org/)** — free, OAuth2
   client-credentials auth. Used as a last-resort fallback and to fill in
   live position data when the primary source doesn't include it: altitude,
   ground speed, heading, climb/descent rate, ICAO24 transponder address, and
   ADS-B emitter category, plus a "View on map" link — all shown on the card
   for any in-flight tracked flight, regardless of which provider supplied
   the rest of its data. OpenSky itself can't report schedules, gates, or
   terminals — only current position for an airborne aircraft. Always tried
   last and can't be dragged above the other two in Settings (it's just too
   thin on data to lead), though it can still be disabled. **Also requires
   the server-side proxy** — confirmed by testing that its client-credentials
   token exchange completes server-side (visible in OpenSky's own usage
   dashboard) but isn't exposed to the browser, and there's no per-client
   "Web Origins"/CORS setting in OpenSky's self-service portal to fix it.

   OpenSky is queried using whichever operating-carrier ICAO callsign the
   primary provider actually reports for the flight, not a naive guess built
   from the marketing flight number — regional/codeshare flights (e.g. a
   United Express flight actually flown by SkyWest) broadcast ADS-B under
   the *operating* carrier's own callsign, which a marketing-number guess
   would never match.

   OpenSky is also used for a secondary, best-effort enrichment: when the
   primary provider hasn't confirmed an actual departure/arrival time yet,
   the proxy queries OpenSky's airport-based `/flights/departure` and
   `/flights/arrival` endpoints (ADS-B track history — observed first/last
   contact times) and, if a match is found by callsign, shows it as a
   distinctly labeled "ADS-B confirmed" line — never merged into or
   overwriting the primary provider's own `actual` time, since "first ADS-B
   contact" and "actual gate departure" aren't quite the same event.

This order (aside from OpenSky's fixed last position) is just the default —
in **Settings**, drag AviationStack/FlightAware to change which is tried
first, or uncheck either to skip it entirely. Changes take effect
immediately, no save button needed.

A **Demo mode** toggle in Settings switches to an offline mock provider that
generates plausible sample data — useful for trying the UI without spending
API quota, or before you've set up any keys.

A `GoogleProvider` class exists in the codebase for interface-completeness
with the original design brief (which called for scraping Google Search
directly), but it's intentionally non-functional: a browser page can't read
`google.com/search` responses (Google doesn't send CORS headers permitting
it), and a server-side scraper would violate Google's Terms of Service. See
the comment in `src/providers/GoogleProvider.ts` for details. SerpApi was
tried as a compliant middle ground and was removed after testing showed its
`/search` endpoint (any engine, not just the Google one) has the identical
no-CORS problem as calling Google directly — same wall, different vendor.

### Adding your API keys

Open the app and click the gear icon (top right) to open **Settings**.

- **AviationStack**: paste the key directly into the field there. Stored
  only in this browser's `localStorage` — sent directly from your browser to
  AviationStack's API, never through any server of ours.
- **FlightAware** and **OpenSky**: no fields in the UI for either — both are
  called through this app's own server-side proxy (details below), and their
  credentials are set as environment variables instead, so they never touch
  browser network traffic at all. This matters more for FlightAware since
  AeroAPI is billed per request.

## The proxy (FlightAware + OpenSky + aircraft photos)

Neither AeroAPI nor OpenSky's REST API can be called from a browser (no CORS
support on either — confirmed by testing, not assumed), so this project
includes a minimal same-origin proxy for each. planespotters.net's photo API
(used for the aircraft photo shown on in-flight cards) *is* CORS-enabled,
but it requires every request to send a descriptive `User-Agent` identifying
the calling app, and browsers won't let client-side JS override that header
— so it's proxied the same way, even though the CORS problem itself doesn't
apply.

- `server/flightAwareCore.ts` / `server/openSkyCore.ts` /
  `server/aircraftPhotoCore.ts` — the actual forwarding logic for each
  provider. The aircraft-photo one needs no API key, just the hardcoded
  identifying `User-Agent` (confirmed necessary by testing: a generic
  `curl`-style User-Agent gets a `403`, an identifying one gets a normal
  `200`).
- `server/viteFlightAwareProxyPlugin.ts` / `server/viteOpenSkyProxyPlugin.ts`
  / `server/viteAircraftPhotoProxyPlugin.ts` — Vite dev-server middleware
  that serves `/api/flightaware`, `/api/opensky`, and `/api/aircraftPhoto`
  automatically whenever you run `npm run dev`. Nothing extra to start; all
  three are wired into `vite.config.ts`.
- `api/flightaware.ts` / `api/opensky.ts` / `api/aircraftPhoto.ts` —
  [Vercel serverless functions](https://vercel.com/docs/functions) for
  production. Files under `/api` become endpoints automatically on Vercel
  with zero config. Deploying elsewhere (Netlify Functions, Cloudflare Pages
  Functions, a small Node server, etc.) means adapting these files to that
  platform's handler signature — the shared logic in `flightAwareCore.ts`/
  `openSkyCore.ts`/`aircraftPhotoCore.ts` doesn't need to change.

The OpenSky proxy does slightly more than a dumb passthrough: it also
matches the requested flight's ICAO callsign against OpenSky's global
state-vector snapshot server-side, rather than shipping that whole
(multi-megabyte) payload to the browser just to find one row.

### Local setup

```bash
cp .env.example .env
# then edit .env and fill in whichever of these you have:
#   FLIGHTAWARE_API_KEY=your-key-here
#   OPENSKY_CLIENT_ID=your-client-id
#   OPENSKY_CLIENT_SECRET=your-client-secret
```

`npm run dev` picks these up automatically (via `dotenv`, loaded in
`vite.config.ts`) and proxies `/api/flightaware` and `/api/opensky` requests
through them. Skip either and that provider just reports "not configured",
same as any other unconfigured provider — the chain falls through to
whatever's next. `/api/aircraftPhoto` needs no environment variable at all —
planespotters.net requires no API key, just the identifying `User-Agent`
already hardcoded in `aircraftPhotoCore.ts`.

### Deploying

If you deploy to **Vercel**: push the repo, set `FLIGHTAWARE_API_KEY` /
`OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` in the project's Environment
Variables, done — both `/api` functions pick them up automatically. If you
deploy elsewhere, everything except those two proxy endpoints is still a
static site (`npm run build` → `dist/`); you'll need to host
`api/flightaware.ts` and `api/opensky.ts`'s logic (or ports of them) as
whatever your platform calls a serverless/edge function, reachable at the
same origin as the app, at paths `/api/flightaware` and `/api/opensky` — or
run `server/productionServer.ts`, a plain Node/Express server that does
exactly this on a single port for any self-hosted target (see below for a
Raspberry Pi walkthrough).

### Deploying to a Raspberry Pi (LAN)

`server/productionServer.ts` wraps the same `*Core.ts` proxy logic used by
the Vite dev server and Vercel functions in a small Express app, serving
both the built static site and the three `/api/*` proxy routes from one
Node process on one port — no Vercel account needed. It binds to
`0.0.0.0`, so once it's running it's reachable from any other device on
the same network at `http://<pi-ip-address>:3000`.

1. **Install Node.js 20+** on the Pi (Raspberry Pi OS's default `apt` Node
   package is often too old). The [NodeSource setup
   script](https://github.com/nodesource/distributions) or
   [nvm](https://github.com/nvm-sh/nvm) both work fine on Raspberry Pi OS
   (arm64).
2. **Get the code onto the Pi** — `git clone` the repo (this branch,
   `PSPiDeployment`, if that's what you're on) directly on the Pi, or copy
   the working tree over some other way.
3. **Install dependencies and configure secrets:**
   ```bash
   cd planestatus
   npm install
   cp .env.example .env
   # edit .env: FLIGHTAWARE_API_KEY / OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET
   # (AviationStack's key is entered in the app's own Settings UI once it's running, not here)
   ```
4. **Build and start it:**
   ```bash
   npm run build
   npm run serve
   ```
   You should see `PlaneStatus serving on http://0.0.0.0:3000`. From
   another device on the same Wi-Fi/network, find the Pi's LAN address
   (`hostname -I` on the Pi) and open `http://<that-address>:3000` in a
   browser. Change the port by setting `PORT=<number>` in `.env` before
   starting.
5. **Keep it running** — `npm run serve` only lasts as long as that
   terminal session. To have it start on boot and restart if it ever
   crashes, install the provided `systemd` unit:
   ```bash
   sudo cp deploy/planestatus.service /etc/systemd/system/planestatus.service
   # edit WorkingDirectory/User inside it first if your setup differs from the defaults
   sudo systemctl daemon-reload
   sudo systemctl enable --now planestatus
   ```
   Check on it with `systemctl status planestatus` or `journalctl -u
   planestatus -f`. Re-run `npm run build` and `sudo systemctl restart
   planestatus` after pulling any future code changes.

This setup is LAN-only by design — nothing here opens a port on your
router or exposes the Pi to the public internet. Every device that needs
access just has to be on the same local network as the Pi.

## Getting started

### Prerequisites

- Node.js 18+ and npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot module reload. Set up
`.env` first (see above) if you want FlightAware or OpenSky to actually work.

### Production build

```bash
npm run build
```

Output goes to `dist/`. Preview the production build locally with:

```bash
npm run preview
```

(`npm run preview` serves the static build only — it does not run either
proxy; use `npm run dev` to test those locally.)

## Project structure

```
src/
  broadcast/     Standalone split-flap departures-board view (see below)
  components/    UI components (dashboard, flight card, settings modal, ...)
  contexts/      React context for app-wide settings
  data/          Static reference data (airline IATA/ICAO code table)
  hooks/         React hooks (flight state, auto-refresh, clock tick)
  providers/     FlightProvider implementations + orchestration
  services/      Business logic (normalization, status resolution, progress
                 calculation, sorting) — no React or fetch here
  storage/       localStorage persistence
  types/         Shared TypeScript types
  utils/         Formatting and misc utilities
server/          FlightAware/OpenSky/aircraft-photo proxy core logic, Vite dev-server middleware,
                 and productionServer.ts (standalone Express server for self-hosted deploys)
api/             Vercel serverless functions (production proxy endpoints)
deploy/          systemd unit for running productionServer.ts as a service (e.g. on a Raspberry Pi)
```

## Broadcast mode

Click **Broadcast** (top right, next to the gear icon) to open a second,
read-only view styled like a real airport split-flap (Solari) departures
board — mechanical flip-tile animation, a live clock, and color-coded status
per flight (green landed, cyan in-flight, yellow delayed, red cancelled) —
meant to be cast to a TV or second monitor while the main dashboard stays
open elsewhere.

It's a separate view reached via a query string (`/?broadcast=1`), not a
client-side route, so it works identically in dev and once deployed with
zero routing config. It never makes its own API calls — it only reads
whatever's already saved from the main tab's own lookups, updating live via
the cross-tab `storage` event (plus a slow poll as a fallback). The main app
tab needs to stay open somewhere (it can be in the background, just not
closed) for the broadcast tab to keep receiving updates.

## Help

Click the **?** icon (top right) for an in-app, tabbed help panel covering
Getting Started, Auto-Refresh, Data Providers, Notifications & Photos,
Display & Sorting, and Broadcast Board — a quick reference without leaving
the app.

## Notable behavior

- **Flight number parsing**: accepts IATA (`AA123`), ICAO (`AAL210`), and
  spaced (`AA 123`) formats, including airlines with alphanumeric IATA codes
  (`B6512`, `F9400`).
- **Multi-flight entry**: the Add Flight box accepts several flight numbers
  in one go, separated by commas, semicolons, or plain spaces (e.g.
  `DAL5111, AA 123 UAL1234`), all applied to the same flight date. Each is
  added independently — if one is invalid or a duplicate, the rest still
  succeed, and only the failed entries (with per-flight error messages) are
  left in the box for correction.
- **Duplicate detection**: adding the same flight number + date twice
  highlights the existing card instead of creating a second one.
- **Auto-refresh**: Off / 10 / 15 / 30 min / 1 hr by default, chosen to
  avoid burning through AviationStack's 100/month free-tier budget. A 1 min
  / 5 min option is also available for paid API plans — enable "Allow
  high-frequency refresh" in Settings → Advanced first, then selecting
  either from the dropdown requires confirming a warning about API usage.
  Once a flight lands or is cancelled, it stops entirely — no more
  auto-refresh, no more inclusion in Refresh All, and the per-card Refresh
  button itself disappears (leaving only Remove), since nothing about it
  changes anymore.
- **Tiered refresh cadence**: auto-refresh checks flights more than 24h from
  departure only every 4 hours, and flights 12–24h out only every hour,
  regardless of the interval selected above — gates and terminals essentially
  never change that far in advance. Once a flight is within 12h of departure
  (or has already departed), it refreshes at your selected interval as
  normal. This only throttles the *automatic* timer; "Refresh All" and each
  card's own Refresh button always run immediately.
- **Far-out flights (2+ days before departure)**: free-tier flight-data plans
  typically only return results for today and tomorrow, so adding a flight
  further out than that prompts once per session: "Do you have paid access
  that supports looking up flights further out?" Answering **yes** adds the
  flight and looks it up immediately, same as any other flight, and isn't
  asked again this session. Answering **no** adds the flight but skips the
  lookup entirely — the card explains it'll start tracking automatically
  about 36 hours before departure (once ~30h out, it briefly rechecks, then
  hands off to the normal tiered cadence above) — and this answer is
  remembered for the rest of the session too, so it won't ask again either
  way until the page reloads. The per-card Refresh button always works
  immediately regardless, if you want to check sooner anyway.
- **Status inference guards against a stuck "In Flight"**: providers
  sometimes just never flip their own status field to "landed." If a flight
  is more than an hour past its estimated arrival with no live position data
  actively showing it still airborne, the dashboard treats it as landed
  rather than showing "In Flight" (and "0 min remaining") indefinitely.
- **Live position sanity-checked against departure time**: a live ADS-B
  match is only trusted as evidence a flight is airborne within about an
  hour of its own scheduled/estimated departure. This matters for flight
  numbers that cover more than one same-day leg (an out-and-back rotation
  under one designator) — without this guard, a live match for the
  *other* leg's aircraft could get wrongly attributed to the leg currently
  on screen.
- **FlightAware same-day multi-leg handling**: for flight numbers covering
  a same-day out-and-back rotation, AeroAPI can return both legs as
  separate entries for the same date — not necessarily in chronological
  order. The app picks whichever leg is actually in progress (departed,
  not yet arrived) over one that merely matches the date, falling back to
  whichever leg's departure is closest to now if neither has departed yet.
- **Caching**: lookups are cached for 60 seconds and de-duplicated, so
  rapid actions (e.g. clicking Refresh All right after Add) don't fire
  redundant requests.
- **Transparent failure reporting**: if a lookup fails, the card shows a
  breakdown of every provider that was tried (or skipped, and why) rather
  than just the last error — e.g. "AviationStack: not configured", "OpenSky:
  disabled in Settings", "FlightAware: authentication failed". No guessing
  which providers actually ran.
- **Request budget tracking**: Settings shows how many AviationStack
  requests you've used this calendar month against its free-tier cap,
  persisted in `localStorage` and reset automatically each new calendar
  month. AviationStack has no API to verify this count against their own
  records (confirmed — their dashboard is the only source of truth), so
  Settings also links to that dashboard and lets you manually correct the
  local count if it drifts, e.g. from checking a different browser/origin
  than where the real usage happened. FlightAware and OpenSky have no
  fixed quota tracked here (pay-per-use / rate-limited rather than a
  monthly allowance) — the session request limit below is the relevant
  guard for both instead.
- **Card reordering**: dashboard cards auto-sort by status priority (boarding
  > in flight > delayed > scheduled > landed > cancelled) by default. Drag
  any card's grip handle to switch to a custom order — a banner appears with
  a one-click "Reset to auto-sort" link to go back. Works with mouse, touch,
  and keyboard (focus the grip handle, press Space to pick up, arrow keys to
  move, Space again to drop).
- **Provider order is user-configurable**: drag AviationStack/FlightAware in
  Settings to change which is tried first; uncheck either to skip it. OpenSky
  is pinned to always run last (it only ever supplies live position, never
  gates/terminals/schedules) and can be disabled but not reordered above the
  richer sources.
- **Session request limit**: a separate, in-memory cap (Settings → Session
  request limit) on top of each provider's own quota. Set the total requests
  you're willing to spend this sitting and the app estimates how long that
  lasts at the current auto-refresh interval and flight count. Once spent,
  no further requests run — even if auto-refresh keeps firing — until you
  click Restart (or reload the page, which resets it automatically since
  it isn't persisted). This exists specifically so walking away with
  auto-refresh on doesn't quietly rack up FlightAware usage or burn through
  AviationStack's monthly quota.
- **OpenSky states/all caching**: OpenSky's live-position snapshot covers
  every aircraft on Earth (a sizeable payload), and refreshing several
  in-flight cards at once would otherwise trigger that many redundant
  full-globe fetches. The proxy (`server/openSkyCore.ts`) caches the raw
  snapshot for 15 seconds and de-duplicates concurrent requests within that
  window, so one auto-refresh cycle across many flights costs at most one
  upstream fetch.
- **Display timezone override** (Settings → Time display): by default each
  leg shows its own airport's local time (departure in its zone, arrival in
  its own). Override to show every card in one consistent zone instead —
  your device's timezone, or any specific IANA zone.
- **Aircraft photos** (Settings → Aircraft photos, on by default): any
  in-flight card with a resolved ICAO24 (from OpenSky) shows a real photo of
  that airframe, sourced from planespotters.net with photographer
  attribution. Cached indefinitely in `localStorage` by ICAO24 (a plane's
  photo doesn't change), independent of the 60-second flight-lookup cache
  and the session request limit — a photo fetch never counts against
  either. Turning the setting off just hides the photo on cards; it doesn't
  clear the cache.
- **Flight change notifications** (Settings → Notifications): opt-in browser
  notifications when a tracked flight's gate, terminal, or status changes on
  refresh. Foreground-only — it's the plain `Notification` Web API riding on
  the app's existing refresh cycle, not full Web Push, so it only fires
  while this tab is open somewhere (doesn't need focus) and stops the moment
  the tab or browser closes. Enabling it requests the browser's native
  notification permission; declining reverts the toggle and explains why.
