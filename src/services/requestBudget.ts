const STORAGE_KEY = 'planestatus:requestBudget';

interface BudgetRecord {
  yearMonth: string; // "2026-07"
  count: number;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function readRecord(providerId: string): BudgetRecord {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${providerId}`);
    if (!raw) return { yearMonth: currentYearMonth(), count: 0 };
    const parsed = JSON.parse(raw) as BudgetRecord;
    if (parsed.yearMonth !== currentYearMonth()) {
      return { yearMonth: currentYearMonth(), count: 0 };
    }
    return parsed;
  } catch {
    return { yearMonth: currentYearMonth(), count: 0 };
  }
}

function writeRecord(providerId: string, record: BudgetRecord): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${providerId}`, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private browsing quota, etc) — budget tracking
    // becomes a no-op rather than crashing the app.
  }
}

/**
 * Tracks how many requests have been made this calendar month against a
 * provider's free-tier quota, so the UI can warn before the account gets
 * throttled instead of finding out from a failed request.
 */
export class MonthlyRequestBudget {
  constructor(
    private readonly providerId: string,
    private readonly monthlyLimit: number,
  ) {}

  get used(): number {
    return readRecord(this.providerId).count;
  }

  get remaining(): number {
    return Math.max(0, this.monthlyLimit - this.used);
  }

  get limit(): number {
    return this.monthlyLimit;
  }

  hasRemaining(): boolean {
    return this.remaining > 0;
  }

  recordUsage(): void {
    const record = readRecord(this.providerId);
    writeRecord(this.providerId, { ...record, count: record.count + 1 });
  }
}
