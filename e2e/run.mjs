// Startet die App auf einem eigenen Port, führt die Browser-Tests aus und beendet sie wieder.
// Aufruf: npm run e2e   (einzelne Datei: npm run e2e -- e2e/board.e2e.mjs)
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

const PORT = 4300;
const URL = `http://localhost:${PORT}`;
const dateien = process.argv.slice(2);
const tests = dateien.length
  ? dateien
  : readdirSync('e2e')
      .filter((d) => d.endsWith('.e2e.mjs'))
      .map((d) => `e2e/${d}`);

const server = spawn('npx', ['ng', 'serve', '--port', String(PORT)], {
  stdio: 'ignore',
  detached: true,
});
const beenden = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* bereits beendet */
  }
};
process.on('exit', beenden);

async function warteAufServer() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Die App antwortet nicht unter ${URL}`);
}

await warteAufServer();
const lauf = spawn(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
  stdio: 'inherit',
  env: { ...process.env, E2E_URL: URL },
});
lauf.on('exit', (code) => {
  beenden();
  process.exit(code ?? 1);
});
