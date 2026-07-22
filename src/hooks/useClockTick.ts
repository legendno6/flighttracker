import { useEffect, useState } from 'react';
import { CLOCK_TICK_MS } from '../utils/constants';

/** Forces a re-render every minute, so elapsed/remaining/progress can update without a network call. */
export function useClockTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}
