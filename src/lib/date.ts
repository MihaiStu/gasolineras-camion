const SPAIN_TZ = 'Europe/Madrid';

function toLocalDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Could not format date for time zone ${timeZone}`);
  }

  return { year, month, day };
}

function toIsoDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function assertValidDaysAgo(daysAgo: number): void {
  if (!Number.isInteger(daysAgo) || daysAgo < 0) {
    throw new Error(`daysAgo must be a non-negative integer, received: ${daysAgo}`);
  }
}

export function getTodayInSpain(): string {
  const { year, month, day } = toLocalDateParts(new Date(), SPAIN_TZ);
  return toIsoDateString(year, month, day);
}

export function getDateDaysAgoInSpain(daysAgo: number): string {
  assertValidDaysAgo(daysAgo);

  const { year, month, day } = toLocalDateParts(new Date(), SPAIN_TZ);
  const spainTodayUtcMidnight = new Date(Date.UTC(year, month - 1, day));
  spainTodayUtcMidnight.setUTCDate(spainTodayUtcMidnight.getUTCDate() - daysAgo);

  return toIsoDateString(
    spainTodayUtcMidnight.getUTCFullYear(),
    spainTodayUtcMidnight.getUTCMonth() + 1,
    spainTodayUtcMidnight.getUTCDate()
  );
}
