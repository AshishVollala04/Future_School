// Runs every *.check.mts with tsx and fails if any check prints FAIL or exits non-zero.
// Each check file runs in its own process (fresh in-memory storage), so they cannot affect each other.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.check.mts')).sort();
let pass = 0;
let fail = 0;
const broken = [];

for (const f of files) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', join(here, f)], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const p = (out.match(/^PASS /gm) ?? []).length;
  const failed = out.split('\n').filter(l => l.startsWith('FAIL '));
  pass += p;
  fail += failed.length;
  const ok = r.status === 0 && failed.length === 0 && p > 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f.padEnd(28)} ${p} passed${failed.length ? `, ${failed.length} failed` : ''}`);
  if (!ok) {
    broken.push(f);
    failed.forEach(l => console.log('     ' + l));
    if (r.status !== 0 && failed.length === 0) console.log(out.split('\n').slice(-15).map(l => '     ' + l).join('\n'));
  }
}

console.log(`\n${pass} checks passed, ${fail} failed, ${files.length} files`);
if (broken.length) process.exit(1);
