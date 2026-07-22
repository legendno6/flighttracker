import { useEffect, useState } from 'react';
import type { AirportInfo, TrackedFlight } from '../types/flight';
import { loadSettings, loadTrackedFlights } from '../storage/localStorage';
import { sortTrackedFlights } from '../services/flightService';
import { formatTimeInZone, resolveDisplayTimezone } from '../utils/dateTimeUtils';
import { SplitFlap } from './SplitFlap';
import { statusFlapColor } from './boardStatus';
import './broadcast.css';

function useTick(intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

/** Re-reads localStorage on the app's own writes (via the cross-tab `storage` event) and on a slow poll as a safety net. */
function useBroadcastFlights(): TrackedFlight[] {
  const [flights, setFlights] = useState<TrackedFlight[]>(() => loadTrackedFlights());

  useEffect(() => {
    const reload = () => setFlights(loadTrackedFlights());
    window.addEventListener('storage', reload);
    const poll = window.setInterval(reload, 10_000);
    return () => {
      window.removeEventListener('storage', reload);
      window.clearInterval(poll);
    };
  }, []);

  return flights;
}

function PlaneGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 16.5 21 12l-19-4.5v3.6L14 12l-12 .9z" />
    </svg>
  );
}

function airportTime(info: AirportInfo, displayTimezone: string): string {
  const value = info.actual ?? info.estimated ?? info.scheduled;
  const zone = resolveDisplayTimezone(displayTimezone, info.timezone);
  return formatTimeInZone(value, zone) ?? '—';
}

export function BroadcastBoard() {
  useEffect(() => {
    document.title = 'PlaneStatus — Departures';
  }, []);

  const settings = loadSettings();
  const flights = useBroadcastFlights();
  useTick(1000);
  const now = new Date();

  const clockStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const board = sortTrackedFlights(flights).filter((f): f is TrackedFlight & { data: NonNullable<TrackedFlight['data']> } => !!f.data);

  return (
    <div className="fids-board">
      <div className="fids-topbar">
        <div className="fids-wordmark">
          <PlaneGlyph />
          <div>
            <div className="fids-wordmark-text">Departures</div>
            <div className="fids-wordmark-sub">PlaneStatus Live Board</div>
          </div>
        </div>
        <div>
          <div className="fids-clock">
            <SplitFlap value={clockStr} width={8} colorVar="var(--fids-white)" />
          </div>
          <div className="fids-clock-date">{dateStr}</div>
        </div>
      </div>

      <div className="fids-table">
        <div className="fids-columns">
          <div>Flight</div>
          <div>Departs</div>
          <div>Time</div>
          <div>Arrives</div>
          <div>Time</div>
          <div>Status</div>
          <div>Term</div>
        </div>

        {board.length === 0 ? (
          <div className="fids-empty">No flights tracked</div>
        ) : (
          <div className="fids-rows">
            {board.map((flight) => {
            const { data } = flight;
            const ident = data.flightIcao ?? data.flightIata ?? flight.input;
            return (
              <div className="fids-row" key={flight.id}>
                <div>
                  <SplitFlap value={ident} width={8} />
                </div>
                <div>
                  <SplitFlap value={data.departure.code ?? '—'} width={3} />
                  {data.departure.city && <div className="fids-cell-label">{data.departure.city}</div>}
                </div>
                <div>
                  <SplitFlap value={airportTime(data.departure, settings.displayTimezone)} width={8} />
                </div>
                <div>
                  <SplitFlap value={data.arrival.code ?? '—'} width={3} />
                  {data.arrival.city && <div className="fids-cell-label">{data.arrival.city}</div>}
                </div>
                <div>
                  <SplitFlap value={airportTime(data.arrival, settings.displayTimezone)} width={8} />
                </div>
                <div>
                  <SplitFlap value={data.status} width={10} colorVar={statusFlapColor(data.status)} />
                </div>
                <div>
                  <SplitFlap value={data.departure.terminal ?? '—'} width={3} />
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="fids-footer">
        <span>
          <span className="fids-footer-dot">&#9679;</span> Live &middot; updates automatically
        </span>
        <span>
          {board.length} flight{board.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
