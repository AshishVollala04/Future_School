/**
 * Teacher sign-in PIN rule (the server enforces the same rule).
 * Refused: not 4 digits, one digit four times (1111), digits in a row (1234, 4321),
 * and the first or last 4 digits of the teacher's mobile.
 */
export function pinWeakness(pin: string, mobile?: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'Enter exactly 4 digits.';
  if (new Set(pin).size === 1) return 'Do not use the same digit four times.';
  let up = true;
  let down = true;
  for (let i = 1; i < 4; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    up = up && d === 1;
    down = down && d === -1;
  }
  if (up || down) return 'Do not use digits in a row (like 1234 or 4321).';
  if (mobile && mobile.length >= 4 && (mobile.endsWith(pin) || mobile.startsWith(pin))) return 'Do not use part of your mobile number.';
  return null;
}

export const PIN_MAX_FAILS = 5;
