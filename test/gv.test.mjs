// Offline tests for the helper: no request leaves the machine. Network commands
// are exercised against a pre-seeded cache, which must short-circuit them.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GV = join(ROOT, 'skills', 'grupo-venus', 'scripts', 'gv.mjs');
const FIX = join(ROOT, 'test', 'fixtures');

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'gv-'));
  const run = (...args) => execFileSync(process.execPath, [GV, ...args], {
    env: { ...process.env, GRUPO_VENUS_HOME: home }, encoding: 'utf8',
  });
  // Runs the helper against scripted site answers (see mock-site.mjs); returns its output and what it sent.
  const site = (steps, ...args) => {
    const file = join(home, 'mock.json');
    writeFileSync(file, JSON.stringify(steps)); rmSync(`${file}.log`, { force: true });
    const stdout = execFileSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'test', 'mock-site.mjs')).href, GV, ...args], {
      env: { ...process.env, GRUPO_VENUS_HOME: home, GV_MOCK: file }, encoding: 'utf8', stdio: 'pipe',
    });
    return { stdout, sent: readFileSync(`${file}.log`, 'utf8').trim().split('\n').map(l => JSON.parse(l)) };
  };
  return { home, run, site, done: () => rmSync(home, { recursive: true, force: true }) };
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
    // Neighbours stay: a key that extends this one, and a report naming someone whose name only contains this one.
    s.run('import', join(FIX, 'lista.html'));
    const db = JSON.parse(readFileSync(join(s.home, 'grupo-venus.json'), 'utf8'));
    db.people['luis-alberto-spinetta-jr'] = { ...db.people['luis-alberto-spinetta'], name: 'Otro' };
    writeFileSync(join(s.home, 'grupo-venus.json'), JSON.stringify(db));
    const kept = ['luis-alberto-spinetta-jr-62-E-T-x.html', 'tic-2026-2-2-2-2-2.html'];
    writeFileSync(join(reports, kept[0]), 'x');
    writeFileSync(join(reports, kept[1]), 'para: Luis Alberto Spinettango');
    assert.equal(JSON.parse(s.run('remove', 'luis-alberto-spinetta', '--yes')).cached_files_deleted, 3, 'copies saved by read go too');
    assert.ok(!existsSync(join(reports, 'tic-2026-1-1-1-1-1.html')));
    for (const f of kept) assert.ok(existsSync(join(reports, f)), f);
  } finally { s.done(); }
});

test('site flows, scripted: return place form, second-person picker, numerology, repeats, ticket status', () => {
  const s = sandbox();
  try {
    const KEY = 'luis-alberto-spinetta', TIC = 'ABCD1234EFGH5678';
    const reports = join(s.home, 'grupo-venus-cache', 'reports'), REPORT = readFileSync(join(FIX, 'report.html'), 'latin1');
    const files = () => existsSync(reports) ? readdirSync(reports) : [];
    s.run('import', join(FIX, 'lista.html'));
    s.run('ticket', 'set', TIC);

    // Solar return: the site asks where the person is that year, then redirects to the report.
    const form = '<form METHOD="POST" ACTION="ciuda.asp"><input type="hidden" name="urldestino" value="infrevsol.asp">'
      + '<select name="DIA1"></select><select name="MES1"></select><select name="ANO1"></select></form>';
    let r = s.site([
      { path: 'informes3.asp', body: form },
      { path: 'ciuda.asp', status: 302, headers: { location: 'infrevsol.asp', 'set-cookie': 'ASPSESSIONIDX=abc; path=/' } },
      { path: 'infrevsol.asp', body: REPORT },
    ], 'make', KEY, '--report=13', '--start', '2027-01-01', '--city', 'Madrid', '--country', 'España', '--yes');
    assert.match(r.sent[0].body, /INFORMEDESEADO=13&.*TIC=ABCD1234EFGH5678/);
    assert.match(r.sent[1].body, /^urldestino=infrevsol\.asp&DIA1=1&MES1=1&ANO1=2027&14PAIS=Espa%F1a&08CIUDAD=Madrid&boton1=Calcular$/);
    assert.equal(r.sent[2].cookie, 'ASPSESSIONIDX=abc', 'the session cookie follows the redirect');
    assert.equal(JSON.parse(r.stdout).credits_left, 41);
    assert.deepEqual(files(), [`${KEY}-13-E-T-2027-01-01-madrid-espana.html`]);

    // Two people: both go in the person-list cookies, the second is picked in a form. An unsaved one is not cached.
    const ana = 'Ana;3/4/1990 10:00:00 AM;Madrid;España;H;;-1;40N25;3W42';
    r = s.site([
      { path: 'informes3.asp', body: '<form ACTION="infcmpt.asp" METHOD="POST"><select name="nombre"><option>Ana</option></select></form>' },
      { path: 'infcmpt.asp', body: REPORT },
    ], 'make', KEY, '--line2', ana, '--report=16', '--yes');
    assert.match(r.sent[0].cookie, /^d0=Luis\+Alberto\+Spinetta%3B.*; d1=Ana%3B/);
    assert.match(r.sent[1].body, /nombre=Ana%3B3%2F4%2F1990/);
    assert.equal(files().length, 1, 'nothing is written for an unsaved second person');

    // Numerology: the full birth name and signature go in the request and are never written to disk.
    r = s.site([
      { path: 'informes3.asp', body: '<form ACTION="numerologia2.asp"><input type="hidden" name="p1" value="SS"><input name="firma"></form>' },
      { path: 'numerologia2.asp', body: REPORT },
    ], 'make', KEY, '--report=947', '--fullname', 'Luis Alberto Full', '--signature', 'L. S.');
    assert.match(r.sent[0].body, /^nombre=Luis\+Alberto\+Full%3B.*&TIC=&/, 'free: no ticket is sent');
    assert.equal(r.sent[1].body, 'p1=SS&firma=L.+S.&boton1=Continuar');
    assert.ok(!('credits_left' in JSON.parse(r.stdout)));
    assert.equal(files().length, 1, 'a report made with --fullname is not cached');

    // A repeat: the site links to the earlier report, which is read (here from the local copy) at no cost.
    copyFileSync(join(FIX, 'report.html'), join(reports, 'tic-2026-11-5-21-1-39.html'));
    r = s.site([{ path: 'informes3.asp', body: `YA EXISTE <a href="informes11.asp?tic=${TIC}&fec=2026-11-5 21:1:39">ver</a>` }], 'make', KEY, '--report=62', '--yes');
    assert.match(JSON.parse(r.stdout).existing, /no credit used/);

    // The same repeat for an unsaved person is read from the site and nothing is kept.
    const before = files();
    r = s.site([
      { path: 'informes3.asp', body: `YA EXISTE <a href="informes11.asp?tic=${TIC}&fec=2026-1-2 3:4:5">ver</a>` },
      { path: 'informes11.asp', body: REPORT },
    ], 'make', '--line', ana, '--report=62', '--yes');
    assert.match(JSON.parse(r.stdout).existing, /no credit used/);
    assert.deepEqual(files(), before, 'no report is written for an unsaved person');
    if (process.platform !== 'win32') assert.equal(statSync(join(reports, `${KEY}-13-E-T-2027-01-01-madrid-espana.html`)).mode & 0o777, 0o600, 'cached reports are owner-only');

    // A redirect to another host is refused: the person and session cookies go nowhere else.
    assert.throws(() => s.site([{ path: 'informes3.asp', status: 302, headers: { location: 'https://example.com/x' } }], 'make', KEY, '--report=66', '--yes'),
      e => /refusing a redirect to another host/.test(e.stderr));

    // Anything the site echoes has the ticket masked.
    assert.throws(() => s.site([{ path: 'informes3.asp', body: `Error en el ticket ${TIC}` }], 'make', KEY, '--report=66', '--yes'),
      e => /did not return a report: Error en el ticket ABC\.\.\.78/.test(e.stderr) && !e.stderr.includes(TIC));

    // Status: the counters page gets a placeholder person, never a real one.
    r = s.site([
      { path: 'info.asp', body: 'Informes&nbsp;creados&nbsp;29 Informes&nbsp;disponibles&nbsp;<b>171</b>' },
      { path: 'ticinfo.asp', body: 'Fecha de caducidad del ticket : 2999-10-28' },
    ], 'ticket');
    assert.equal(r.sent[0].cookie, 'd0=X%3B1%2F1%2F2000+12%3A00%3A00+PM%3BX%3BX%3BV%3B%3B0%3B0N00%3B0W00');
    const st = JSON.parse(r.stdout);
    assert.deepEqual([st.credits_left, st.reports_created, st.expires, st.valid], [171, 29, '2999-10-28', true]);
    assert.ok(!r.stdout.includes(TIC));

    // An unsaved person's chart is a temporary file that expires.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8)]).toString('latin1');
    const chart = JSON.parse(s.site([{ path: 'dibujo.aspx', body: png }], 'chart', '--line', ana).stdout).file;
    assert.ok(existsSync(chart));
    s.run('list');
    assert.ok(existsSync(chart), 'a fresh temporary chart stays');
    const old = new Date(Date.now() - 2 * 36e5);
    utimesSync(chart, old, old);
    s.run('list');
    assert.ok(!existsSync(chart), 'any run deletes temporary charts older than an hour');
  } finally { s.done(); }
});
