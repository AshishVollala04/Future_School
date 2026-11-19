// Parents never pay in the app: no payment-order, checkout or mock-payment code path is left in the
// frontend, and the parent fee page only reads dues and recorded receipts. Run with: npm run test:services
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
let fails = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); };

const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
};
walk(SRC);

// Anything that would start an online payment from the browser.
const forbidden = [/createOrder\s*\(/, /confirmMockPayment/, /verifyPayment/, /checkout\.razorpay\.com/, /\/fees\/orders/, /new\s+Razorpay\s*\(/];
for (const re of forbidden) {
  const hits = files.filter(f => re.test(readFileSync(f, 'utf8'))).map(f => f.slice(SRC.length));
  check(`no frontend code matches ${re}`, hits.length === 0, hits);
}

// The parent fee page: dues + receipts + print, no pay button or checkout.
const page = readFileSync(join(SRC, 'modules/parent/app/ParentFeesPage.tsx'), 'utf8');
check('fee page prints recorded receipts', page.includes('PdfService.printFeeReceipt'));
check('fee page lists recorded payments', page.includes('feeService.listPayments'));
check('fee page has no pay / checkout action', !/payAmount|parent\.fees\.pay'|parent\.fees\.checkout|mockCheckout|promptSensitiveActionAuth/.test(page));
check('fee page does not claim a payment releases the hall ticket', !/automatically unlock/i.test(page));

// The fee service a parent uses has no write method at all.
const mem: Record<string, string> = {};
(globalThis as any).window = { localStorage: { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: (i: number) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
const { feeService } = await import(new URL('../../src/services/feeService.ts', import.meta.url).href);
const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(feeService)).filter(m => m !== 'constructor').sort();
check('parent fee service only reads (getSummary, listPayments)', JSON.stringify(methods) === JSON.stringify(['getSummary', 'listPayments']), methods);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
if (fails) process.exit(1);
