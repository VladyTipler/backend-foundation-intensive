// Compatibility entry: the former destructive seeder is replaced by the lab helper.
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ["scripts/lab/index.mjs", "nplusone"], { stdio: 'inherit' });
child.on('error', () => { console.error('Run from the repository root: npm run lab'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
