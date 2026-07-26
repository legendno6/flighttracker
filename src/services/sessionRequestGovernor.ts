/**
 * A hard, in-memory cap on real API requests for the current browser
 * session — independent of each provider's own monthly free-tier budget.
 * Deliberately NOT persisted to localStorage: reloading the page resets it,
 * same as restarting the program would. The "Restart" button in Settings
 * exists purely so a reset doesn't require an actual reload.
 *
 * A limit of 0 (or below) is treated as "no cap" — this session's requests
 * run unthrottled by this governor (each provider's own monthly budget
 * still applies independently).
 */
export class SessionRequestGovernor {
  private usedCount = 0;

  constructor(private readonly getLimit: () => number) {}

  get used(): number {
    return this.usedCount;
  }

  get limit(): number {
    return this.getLimit();
  }

  get remaining(): number {
    if (this.limit <= 0) return Infinity; // 0 (or below) means "no cap"
    return Math.max(0, this.limit - this.usedCount);
  }

  hasRemaining(): boolean {
    if (this.limit <= 0) return true; // 0 (or below) means "no cap"
    return this.usedCount < this.limit;
  }

  recordUsage(): void {
    this.usedCount += 1;
  }

  reset(): void {
    this.usedCount = 0;
  }
}
