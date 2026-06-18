import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function formatCurrency(n: number | null | undefined): string {
  return currencyFmt.format(n ?? 0);
}

export function formatNumber(n: number | null | undefined, digits = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n ?? 0);
}

export function formatMiles(n: number | null | undefined): string {
  return `${formatNumber(n, 1)} mi`;
}

/** date columns arrive as 'YYYY-MM-DD'; timestamps as ISO. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = iso.length <= 10 ? parseISO(iso) : new Date(iso);
    return format(d, 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Whole days from today until `iso` (negative = past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    const target = parseISO(iso).getTime();
    const start = new Date().setHours(0, 0, 0, 0);
    return Math.round((target - start) / 86_400_000);
  } catch {
    return null;
  }
}
