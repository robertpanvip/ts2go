import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname 在 ESM 里需要自己计算
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// go.exe 路径
const goExe = path.join(__dirname, 'lib', 'go', 'bin', 'go.exe');

// main.go 路径
const mainGo = path.join(__dirname, 'test', 'go', "main", 'main.go');

// spawn go.exe
const proc = spawn(goExe, ['run', mainGo], { stdio: 'inherit', cwd: __dirname });

proc.on('close', code => process.exit(code));
