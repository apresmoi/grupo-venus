// Offline tests for the helper: no request leaves the machine. Network commands
// are exercised against a pre-seeded cache, which must short-circuit them.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GV = join(ROOT, 'skills', 'grupo-venus', 'scripts', 'gv.mjs');
const FIX = join(ROOT, 'test', 'fixtures');

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'gv-'));
  const run = (...args) => execFileSync(process.execPath, [GV, ...args], {
    env: { ...process.env, GRUPO_VENUS_HOME: home }, encoding: 'utf8',
  });
  return { home, run, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('import reads the site list file (Latin-1, CRLF, padded names)', () => {
  const s = sandbox();
  try {
    assert.deepEqual(JSON.parse(s.run('import', join(FIX, 'lista.html'))).imported, ['luis-alberto-spinetta']);
    const p = JSON.parse(s.run('list'))['luis-alberto-spinetta'];
    assert.equal(p.name, 'Luis Alberto Spinetta');
    assert.equal(p.city, 'San Martín');
    assert.equal(p.sex, 'V');
    assert.equal(p.tz_offset, '3');
    assert.equal(p.lat_decimal, -34.5833);
    assert.equal(p.lon_decimal, 58.5333); // West is positive, the server's convention
  } finally { s.done(); }
});

test('import keeps a saved style, export round-trips the lines in Latin-1', () => {
  const s = sandbox();
  try {
    s.run('import', join(FIX, 'lista.html'));
    s.run('style', 'luis-alberto-spinetta', 'deep');
    s.run('import', join(FIX, 'lista.html'));
    assert.equal(JSON.parse(s.run('list'))['luis-alberto-spinetta'].style, 'deep');
    const file = join(s.home, 'out.html');
    s.run('export', file);
    const text = new TextDecoder('latin1').decode(readFileSync(file));
    assert.match(text, /Luis Alberto Spinetta;1\/23\/1950 4:35:00 PM;San Martín;Argentina;V;;3;34S35;58W32/);
    assert.match(text, /action="https:\/\/grupovenus\.com\/perso2\.asp"/i);
    assert.match(text, /name="desti" value="modi"/);
  } finally { s.done(); }
});

test('transits parse from cache: codes upper-cased, retrograde windows, peak ranking', () => {
  const s = sandbox();
  try {
    s.run('import', join(FIX, 'lista.html'));
    const day = '2026-11-07';
    mkdirSync(join(s.home, 'grupo-venus-cache', 'transits'), { recursive: true });
    copyFileSync(join(FIX, 'transits.html'), join(s.home, 'grupo-venus-cache', 'transits', `luis-alberto-spinetta-8-${day}.html`));
    const { transits } = JSON.parse(s.run('transits', 'luis-alberto-spinetta', `--start=${day}`));
    assert.deepEqual(transits.map(t => t.code), ['URASEXASC', 'PLUTRIMER']);
    const ura = transits[0];
    assert.equal(ura.peak_height, 52);
    assert.equal(ura.peak_date, '2027-03-20');
    assert.deepEqual(ura.windows, [
      { from: '2026-11-07', to: '2026-11-09', retro: true },
      { from: '2027-03-20', to: '2027-03-20', retro: false },
    ]);
    assert.equal(transits[1].peak_orb, "0°12'");
    assert.ok(!existsSync(join(s.home, 'grupo-venus-cache', '.last')), 'a cached report must not touch the network');
  } finally { s.done(); }
});

test('bad input fails with a message, not a stack trace', () => {
  const s = sandbox();
  try {
    assert.throws(() => s.run('chart', 'nobody'), e => /unknown person 'nobody'/.test(e.stderr));
    assert.throws(() => s.run('add', '--name', 'X'), e => /missing --date/.test(e.stderr));
  } finally { s.done(); }
});

test('people file is owner-only; remove and forget delete personal data and its cache', () => {
  const s = sandbox();
  try {
    s.run('import', join(FIX, 'lista.html'));
    if (process.platform !== 'win32') assert.equal(statSync(join(s.home, 'grupo-venus.json')).mode & 0o777, 0o600);
    const cache = join(s.home, 'grupo-venus-cache');
    for (const d of ['chart', 'transits', 'interp']) mkdirSync(join(cache, d), { recursive: true });
    writeFileSync(join(cache, 'chart', 'luis-alberto-spinetta-T-E.png'), 'x');
    writeFileSync(join(cache, 'transits', 'luis-alberto-spinetta-8-2026-11-07.html'), 'x');
    writeFileSync(join(cache, 'interp', 'transiaw-PLUTRIMER.html'), 'x');
    assert.equal(JSON.parse(s.run('remove', 'luis-alberto-spinetta', '--yes')).cached_files_deleted, 2);
    assert.deepEqual(JSON.parse(s.run('list')), {});
    assert.ok(existsSync(join(cache, 'interp', 'transiaw-PLUTRIMER.html')), 'shared texts hold no personal data and stay');
    assert.throws(() => s.run('forget'), e => /confirm with the user/.test(e.stderr));
    s.run('forget', '--yes');
    assert.ok(!existsSync(cache) && !existsSync(join(s.home, 'grupo-venus.json')));
  } finally { s.done(); }
});

test('options that reach file names or requests are a closed set', () => {
  const s = sandbox();
  try {
    s.run('import', join(FIX, 'lista.html'));
    for (const bad of [['--lang=../../../tmp/x'], ['--zodiac=T/../../x'], ['--report=8/../x'], ['--start=2026-01-01/../x']]) {
      assert.throws(() => s.run('chart', 'luis-alberto-spinetta', ...bad), e => /must be/.test(e.stderr), bad[0]);
    }
    assert.throws(() => s.run('chart', '../etc'), e => /bad KEY/.test(e.stderr));
    assert.throws(() => s.run('interp', '../../x'), e => /CODE looks like/.test(e.stderr));
    assert.throws(() => s.run('remove', 'luis-alberto-spinetta'), e => /--yes/.test(e.stderr));
    assert.ok(!existsSync(join(s.home, 'grupo-venus-cache', '.last')), 'rejected input must never reach the network');
  } finally { s.done(); }
});

test('a malformed --line is rejected and nothing is stored', () => {
  const s = sandbox();
  try {
    assert.throws(() => s.run('chart', '--line', 'not a person'), e => /full person line/.test(e.stderr));
    assert.deepEqual(JSON.parse(s.run('list')), {});
    assert.ok(!existsSync(join(s.home, 'grupo-venus.json')), 'nothing is written for an unsaved person');
  } finally { s.done(); }
});
