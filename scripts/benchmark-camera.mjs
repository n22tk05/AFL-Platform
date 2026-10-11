import { spawnSync } from 'node:child_process';
import path from 'node:path';
const label = process.argv[2] || 'after';
if (!['before','after'].includes(label) || process.argv.length > 3) throw new Error('Usage: npm run benchmark:documents:camera -- [before|after]');
const python = process.env.VIETOCR_PYTHON ?? path.join('services','vietocr-service','.venv',process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const result = spawnSync(python,['scripts/benchmark-camera.py',label],{stdio:'inherit'});
if (result.error) console.error(result.error.message);
if (result.status === 0 && label === 'after') {
  const exported = spawnSync(process.execPath,['--import','./scripts/register-typescript.mjs','scripts/export-camera-results.ts'],{stdio:'inherit'});
  if (exported.error) console.error(exported.error.message);
  process.exit(exported.status ?? 1);
}
process.exit(result.status ?? 1);
