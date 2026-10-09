import { spawnSync } from 'node:child_process';
const loader = new URL('./register-typescript.mjs', import.meta.url).href;
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.documents.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--import=' + loader].filter(Boolean).join(' ') },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
