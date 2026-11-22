// Syntax-checks every JS file and every inline <script> in the HTML pages.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root = new URL('..', import.meta.url).pathname, tmp = mkdtempSync(join(tmpdir(), 'mc-'));
let n = 0, bad = 0;
const check = (file, label) => { try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); n++; } catch (e) { bad++; console.error('✗ ' + label + '\n' + e.stderr); } };
for (const f of readdirSync(root)) {
  if (f.endsWith('.js')) check(join(root, f), f);
  if (f.endsWith('.html')) {
    const html = readFileSync(join(root, f), 'utf8'); let i = 0;
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
      const p = join(tmp, f + '.' + (i++) + '.js'); writeFileSync(p, m[1]); check(p, f + ' inline #' + i);
    }
  }
}
console.log(`${n} scripts OK, ${bad} failed`); process.exit(bad ? 1 : 0);
