import { dateStringSchema } from './transaction.ts';

export const DEFAULT_DEMO_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function getCurrentDateString({
  now = new Date(),
  timeZone = DEFAULT_DEMO_TIME_ZONE,
}: {
  now?: Date;
  timeZone?: string;
} = {}): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return dateStringSchema.parse(`${year}-${month}-${day}`);
}
