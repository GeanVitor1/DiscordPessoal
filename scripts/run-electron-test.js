import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const nativeTest=process.argv[2]?.endsWith('native-electron.js');
// The physical input fixture must be visible; SW_HIDE prevents foreground ownership.
const child=spawn(require('electron'),process.argv.slice(2),{stdio:'inherit',env,windowsHide:!nativeTest});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
