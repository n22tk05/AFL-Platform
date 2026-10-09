import { spawnSync } from 'node:child_process';
import path from 'node:path';
const python = process.env.VIETOCR_PYTHON ?? path.join('services', 'vietocr-service', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'services/vietocr-service/tests', '-v'], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
