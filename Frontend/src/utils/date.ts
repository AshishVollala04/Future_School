/** Date helpers. All business dates are local ISO 'YYYY-MM-DD'. */

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function formatDate(iso: string, lang = 'en'): string {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string, lang = 'en'): string {
  return new Date(iso).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

/** 1 = Monday ... 6 = Saturday, 7 = Sunday */
export function isoWeekday(d: Date = new Date()): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}
