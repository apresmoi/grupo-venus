# Installation

The repository ships one skill, `grupo-venus`, in `skills/grupo-venus/`. It needs **Node.js 18+** on the machine where the agent runs commands. No npm install and no API key are required.

Choose one route per host to avoid duplicate skills, then start a new session. Try: "Show me the natal chart of Luis Alberto Spinetta, born 23 January 1950, 16:35, Buenos Aires."

## OpenClaw

Install from ClawHub: <https://clawhub.ai/apresmoi/skills/grupo-venus>. Or use the standalone installer below with `--provider openclaw`, which links the skill into `~/.openclaw/skills`.

People saved by earlier versions in `~/.openclaw/workspace/memory/grupo-venus.json` keep being used.

## Claude Code

```sh
claude plugin marketplace add apresmoi/grupo-venus
claude plugin install grupo-venus@grupo-venus
```

Inside Claude Code the same commands are `/plugin marketplace add` and `/plugin install`. The explicit command is `/grupo-venus:grupo-venus`.

## Codex

```sh
codex plugin marketplace add apresmoi/grupo-venus
codex plugin add grupo-venus@grupo-venus
```

The catalog is `.agents/plugins/marketplace.json`, and `.codex-plugin/plugin.json` points to `./skills/`. Older clients without `codex plugin` can use the standalone installer.

## GitHub Copilot CLI

Copilot reads the Claude-compatible marketplace:

```sh
copilot plugin marketplace add apresmoi/grupo-venus
copilot plugin install grupo-venus@grupo-venus
```

## Factory Droid

```sh
droid plugin marketplace add https://github.com/apresmoi/grupo-venus
droid plugin install grupo-venus@grupo-venus --scope user
```

## Pi

The repository is a Pi package:

```sh
pi install https://github.com/apresmoi/grupo-venus
```

Run `/reload` in an existing session. The explicit invocation is `/skill:grupo-venus`.

## Kiro

Import the skill folder: <https://github.com/apresmoi/grupo-venus/tree/main/skills/grupo-venus>. Re-import to update.

## Grok, Antigravity, Cursor, OpenCode, OpenClaw, and editable installs

The dependency-free installer links the skill from a local checkout:

```sh
git clone https://github.com/apresmoi/grupo-venus.git
cd grupo-venus
node install.mjs --provider grok
```

| `--provider` | Skills folder |
|---|---|
| `claude` | `$CLAUDE_CONFIG_DIR/skills`, or `~/.claude/skills` |
| `codex` | `$CODEX_HOME/skills`, or `~/.codex/skills` |
| `agents` | `~/.agents/skills` |
| `grok` | `~/.agents/skills` |
| `agy` | `~/.gemini/antigravity-cli/skills` |
| `antigravity` | `~/.gemini/config/skills` (IDE) |
| `cursor` | `~/.cursor/skills` |
| `opencode` | `$XDG_CONFIG_HOME/opencode/skills`, or `~/.config/opencode/skills` |
| `openclaw` | `~/.openclaw/skills` |

- `--dest /path/to/skills` installs into any other folder, including a project-local one.
- `--copy` installs an independent copy instead of a link, for example on Windows without symlink rights. Links need the checkout to stay where it is.
- Re-running an install is a no-op. The installer never replaces unrelated or modified folders.
- `node uninstall.mjs --provider NAME` removes only links to this checkout and unchanged copies it made.

## Other Agent Skills hosts

```sh
npx skills add apresmoi/grupo-venus
```

Pick the skill and the hosts you use (Cline, Amp, Gemini CLI, Windsurf, Zed, Warp, Roo, Kilo and others).

## Updates and local checks

- Native plugins: use the host's marketplace update command, then start a new session.
- Link installs: `git pull` in the checkout.
- Copy installs: uninstall, pull, install again with `--copy`.

```sh
git clone https://github.com/apresmoi/grupo-venus.git
cd grupo-venus
npm test
```

The tests run offline. They install into temporary folders and check the helper against fixtures.
