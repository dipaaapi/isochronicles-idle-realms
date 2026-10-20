// Runs Electron with a script, even from shells that set ELECTRON_RUN_AS_NODE (e.g. VS Code terminals).
const { spawn } = require('child_process');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, process.argv.slice(2), { stdio: 'inherit', env }).on('close', (code) => process.exit(code ?? 0));
