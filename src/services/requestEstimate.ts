export interface SessionDurationEstimate {
  cycles: number;
  minutes: number;
}

/**
 * Best-case estimate of how long a total request budget will last at the
 * current auto-refresh cadence, assuming one request per tracked flight per
 * cycle. Actual usage can be higher when a provider fails over to the next
 * one in the chain, so this is a floor, not a guarantee.
 */
export function estimateSessionDuration(
  totalRequests: number,
  requestsPerCycle: number,
  refreshIntervalMinutes: number,
): SessionDurationEstimate | null {
  if (requestsPerCycle <= 0 || refreshIntervalMinutes <= 0 || totalRequests <= 0) return null;
  const cycles = Math.floor(totalRequests / requestsPerCycle);
  return { cycles, minutes: cycles * refreshIntervalMinutes };
}
