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

test('ticket is stored owner-only, never printed, and forget removes it', () => {
  const s = sandbox();
  try {
    assert.throws(() => s.run('reports'), e => /no ticket/.test(e.stderr));
    assert.throws(() => s.run('ticket', 'set', '../x'), e => /usage: ticket set/.test(e.stderr));
    const shown = s.run('ticket', 'set', 'abcd1234efgh5678');
    assert.ok(!shown.includes('ABCD1234EFGH5678') && /ABC\.\.\.78/.test(shown));
    if (process.platform !== 'win32') assert.equal(statSync(join(s.home, 'ticket')).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(JSON.parse(s.run('ticket', '--offline'))), ['ticket', 'source']);
    assert.ok(!existsSync(join(s.home, 'grupo-venus-cache', '.last')), '--offline makes no request');
    s.run('forget', '--yes');
    assert.ok(!existsSync(join(s.home, 'ticket')));
  } finally { s.done(); }
});

test('paid reports: make needs --yes and a known id, read parses a cached report offline', () => {
  const s = sandbox();
  try {
    s.run('import', join(FIX, 'lista.html'));
    s.run('ticket', 'set', 'ABCD1234EFGH5678');
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--report=62'), e => /one ticket credit/.test(e.stderr));
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--report=999', '--yes'), e => /--report must be one of/.test(e.stderr));
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--report=16', '--yes'), e => /needs a second person/.test(e.stderr));
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--with', 'luis-alberto-spinetta', '--report=62', '--yes'), e => /for one person/.test(e.stderr));
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--with', '../x', '--report=16', '--yes'), e => /bad KEY/.test(e.stderr));
    assert.throws(() => s.run('transits', 'luis-alberto-spinetta', '--report=7'), e => /paid ones go through make/.test(e.stderr));
    assert.throws(() => s.run('read', '../../x'), e => /usage: read ID/.test(e.stderr));
    const reports = join(s.home, 'grupo-venus-cache', 'reports');
    mkdirSync(reports, { recursive: true });
    copyFileSync(join(FIX, 'report.html'), join(reports, 'tic-2026-11-5-21-1-39.html'));
    const text = s.run('read', '2026-11-5 21:1:39');
    assert.match(text, /^### Interpretación de la Carta Astral para: Luis$/m);
    assert.match(text, /^## Capítulo 1 : Su Perspectiva ante la Vida$/m);
    assert.match(text, /^### Ascendente en Leo\n\nFerozmente orgulloso, desea impresionar y ser visto como alguien especial\.\n\nSegundo párrafo\.$/m);
    assert.match(text, /^### Urano Conjunción Mercurio \(URACJCMER\), 12\/12\/2026\n\nIdeas nuevas\.$/m);
    assert.doesNotMatch(text, /^### (12\/12\/2026|Tránsitos ordenados)/m, 'date grid cells are not headings');
    copyFileSync(join(FIX, 'report.html'), join(reports, 'luis-alberto-spinetta-62-E-T-x.html'));
    const made = JSON.parse(s.run('make', 'luis-alberto-spinetta', '--report=62', '--yes'));
    assert.ok(made.cached && !('credits_left' in made), 'a cached report must not show an old credit count');
    assert.ok(!existsSync(join(s.home, 'grupo-venus-cache', '.last')), 'cached reports must not touch the network');
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--report=62', '--fullname', 'X', '--yes'), e => /for numerology/.test(e.stderr));
    assert.throws(() => s.run('make', 'luis-alberto-spinetta', '--report=945', '--fullname', 'a;b'), e => /no semicolons/.test(e.stderr));
    s.run('ticket', 'clear');
    copyFileSync(join(FIX, 'report.html'), join(reports, 'luis-alberto-spinetta-945-E-T-x.html'));
    assert.match(JSON.parse(s.run('make', 'luis-alberto-spinetta', '--report=945')).text, /Ascendente en Leo/, 'free numerology needs no ticket and no --yes');
    assert.ok(!existsSync(join(s.home, 'grupo-venus-cache', '.last')), 'cached reports must not touch the network');
    writeFileSync(join(reports, 'tic-2026-1-1-1-1-1.html'), 'Carta Astral para: Luis Alberto Spinetta');
    assert.equal(JSON.parse(s.run('remove', 'luis-alberto-spinetta', '--yes')).cached_files_deleted, 3, 'copies saved by read go too');
    assert.ok(!existsSync(join(reports, 'tic-2026-1-1-1-1-1.html')));
  } finally { s.done(); }
});
