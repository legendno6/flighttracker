/**
 * A hard, in-memory cap on real API requests for the current browser
 * session — independent of each provider's own monthly free-tier budget.
 * Deliberately NOT persisted to localStorage: reloading the page resets it,
 * same as restarting the program would. The "Restart" button in Settings
 * exists purely so a reset doesn't require an actual reload.
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
    return Math.max(0, this.limit - this.usedCount);
  }

  hasRemaining(): boolean {
    return this.usedCount < this.limit;
  }

  recordUsage(): void {
    this.usedCount += 1;
  }

  reset(): void {
    this.usedCount = 0;
  }
}
