# grupo-venus

An agent skill that acts as a conversational frontend for [grupovenus.com](https://grupovenus.com): natal charts, transit forecasts, transit interpretations and numerology from the free tier, plus the written reports for users who have a ticket.

> **Unofficial.** Not affiliated with or endorsed by Grupo Venus.

**Node.js 18+** · **OpenClaw, Claude Code, Codex, Copilot, Factory, Pi and any Agent Skills host** · **MIT**

---

## What it does

- Fetches and displays **natal chart images**
- Parses **1-year slow-planet transit graphs** (Saturn, Uranus, Neptune, Pluto) into peaks, intensities and active windows
- Retrieves **interpretation texts** in three styles: colloquial, technical and potentials
- Compares two people's transit years
- Stores people across sessions, and imports and exports the person list format of grupovenus.com
- Numerology reports (basic and advanced), free
- Adapts its reading style per person: `casual`, `deep` or `practical`
- With a grupovenus.com ticket: also reads and creates its written reports

No API key required. A ticket is optional and stored owner-only.

---

## A light client

- People come from the site's own downloaded list, or from birth data: the city and country are sent to [Photon](https://photon.komoot.io) for coordinates, and the time zone is worked out locally from a bundled table. Adding someone costs zero requests to grupovenus.com.
- Every site request goes through the bundled helper, which queues requests one at a time, pauses between them and caches every response. Interpretation texts and chart images are fetched once.

---

## Install

**OpenClaw:** [ClawHub](https://clawhub.ai/apresmoi/skills/grupo-venus).

**Claude Code:**

```sh
claude plugin marketplace add apresmoi/grupo-venus
claude plugin install grupo-venus@grupo-venus
```

**Codex:**

```sh
codex plugin marketplace add apresmoi/grupo-venus
codex plugin add grupo-venus@grupo-venus
```

**Any other host:**

```sh
npx skills add apresmoi/grupo-venus
```

Copilot CLI, Factory Droid, Pi, Kiro, Grok, Antigravity, Cursor and OpenCode: see [docs/installation.md](docs/installation.md).

---

## Storage

```
~/.grupo-venus/grupo-venus.json     # people
~/.grupo-venus/grupo-venus-cache/   # cached responses
~/.grupo-venus/ticket               # optional ticket
```

Existing OpenClaw data in `~/.openclaw/workspace/memory/` keeps being used. Set `GRUPO_VENUS_HOME` to choose another folder.

**Privacy:** birth data (name, birth date and time, place, sex) is sent to grupovenus.com, an unofficial third-party site, and city names to photon.komoot.io. The agent asks before saving anyone, and suggests a first name or alias. Files are readable by your user only. Ask the agent to remove a person, or to forget everything, at any time.

---

## Free tier coverage

| Feature | Available |
|---------|-----------|
| Natal chart image | ✅ |
| 1-year outer planet transits (Sat–Plu) | ✅ |
| 3-day / 1-week / 2-week short forecasts | ✅ |
| Transit interpretation texts | ✅ |
| Numerology, basic and advanced | ✅ |
| Full natal and other written reports | With a ticket |
| 2-year and other paid forecasts | With a ticket |

---

## Development

```sh
npm test
```

Offline tests for the helper, the manifests and the installer.

---

## License

MIT. `skills/grupo-venus/data/zone.tab` comes from the public-domain [IANA time zone database](https://www.iana.org/time-zones).
