// Test preload (node --import): answers the helper's requests from a script of steps, so no
// request leaves the machine, and logs what the helper sent. Pauses are skipped.
import { appendFileSync, readFileSync } from 'node:fs';

const steps = JSON.parse(readFileSync(process.env.GV_MOCK, 'utf8'));
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...args) => realTimeout(fn, 0, ...args);
globalThis.fetch = async (url, init = {}) => {
  const step = steps.shift();
  appendFileSync(`${process.env.GV_MOCK}.log`, `${JSON.stringify({ url: String(url), body: init.body ?? null, cookie: init.headers?.Cookie ?? null })}\n`);
  if (!step || !String(url).includes(step.path)) throw new Error(`unexpected request ${url}`);
  return new Response(step.status ? null : Buffer.from(step.body, 'latin1'), { status: step.status ?? 200, headers: step.headers ?? {} });
};
