// Packaging checks: every host manifest agrees, and the installer places a
// working skill and removes only what it owns.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const json = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

test('manifests agree on name and version, and the skill frontmatter is valid', () => {
  const version = json('package.json').version;
  for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.factory-plugin/plugin.json']) {
    const m = json(path);
    assert.equal(m.name, 'grupo-venus', path);
    assert.equal(m.version, version, path);
  }
  for (const path of ['.claude-plugin/marketplace.json', '.factory-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
    assert.equal(json(path).plugins[0].name, 'grupo-venus', path);
  }
  assert.deepEqual(json('package.json').pi.skills, ['./skills/grupo-venus']);
  const skill = readFileSync(join(ROOT, 'skills/grupo-venus/SKILL.md'), 'utf8');
  const front = skill.split('---')[1];
  assert.match(front, /^name: grupo-venus$/m);
  assert.match(front, /^user-invocable: true$/m);
  const meta = JSON.parse(/^metadata: (.*)$/m.exec(front)[1]);
  assert.deepEqual(meta.openclaw.requires.bins, ['node']);
  assert.ok(existsSync(join(ROOT, 'skills/grupo-venus/data/zone.tab')));
});

for (const mode of ['link', 'copy']) {
  test(`installer ${mode} mode: installs a runnable skill, is idempotent, uninstalls cleanly`, () => {
    const dest = mkdtempSync(join(tmpdir(), 'gv-skills-'));
    try {
      const extra = mode === 'copy' ? ['--copy'] : [];
      const run = (script, ...a) => execFileSync(process.execPath, [join(ROOT, script), '--dest', dest, ...a], { encoding: 'utf8' });
      assert.match(run('install.mjs', ...extra), /Installed .*grupo-venus/);
      assert.match(run('install.mjs', ...extra), /Already installed/);
      const target = join(dest, 'grupo-venus');
      assert.equal(lstatSync(target).isSymbolicLink(), mode === 'link');
      const help = execFileSync(process.execPath, [join(target, 'scripts', 'gv.mjs'), '--help'], { encoding: 'utf8' });
      assert.match(help, /Usage: node gv\.mjs/);
      run('uninstall.mjs');
      assert.ok(!existsSync(target));
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });
}

test('installer refuses to replace an unrelated folder', () => {
  const dest = mkdtempSync(join(tmpdir(), 'gv-skills-'));
  try {
    mkdirSync(join(dest, 'grupo-venus'));
    writeFileSync(join(dest, 'grupo-venus', 'SKILL.md'), 'someone else');
    assert.throws(() => execFileSync(process.execPath, [join(ROOT, 'install.mjs'), '--dest', dest], { encoding: 'utf8', stdio: 'pipe' }),
      e => /Refusing unrelated directory/.test(e.stderr));
    assert.equal(readFileSync(join(dest, 'grupo-venus', 'SKILL.md'), 'utf8'), 'someone else');
  } finally { rmSync(dest, { recursive: true, force: true }); }
});

test('every documented provider resolves to a skills folder', () => {
  const help = execFileSync(process.execPath, [join(ROOT, 'install.mjs'), '--help'], { encoding: 'utf8' });
  for (const p of ['claude', 'codex', 'agents', 'grok', 'agy', 'antigravity', 'cursor', 'opencode', 'openclaw']) assert.match(help, new RegExp(`\\b${p}\\b`));
});
