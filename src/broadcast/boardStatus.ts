import type { FlightStatus } from '../types/flight';
import { statusCategory } from '../services/statusResolver';

/** Status-flap color, keyed by the same broad category the rest of the app uses — kept distinct from the board's default amber ink so an active/urgent status reads at a glance. */
const CATEGORY_COLOR_VAR: Record<ReturnType<typeof statusCategory>, string> = {
  ontime: 'var(--fids-good)',
  delayed: 'var(--fids-warn)',
  inflight: 'var(--fids-live)',
  scheduled: 'var(--fids-ink)',
  cancelled: 'var(--fids-bad)',
};

export function statusFlapColor(status: FlightStatus): string {
  return CATEGORY_COLOR_VAR[statusCategory(status)];
}
