import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const local=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const executable=process.env.PYTHON || (existsSync(local)?local:process.platform==='win32'?'python':'python3');
const result=spawnSync(executable,process.argv.slice(2),{stdio:'inherit',env:process.env});
if(result.error){console.error('Python could not start. Create .venv and install requirements-ml.txt, or set PYTHON to your Python executable.');process.exit(1);}
process.exit(result.status??1);
