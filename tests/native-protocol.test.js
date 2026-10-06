import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('compiled helper correlates protocol acknowledgements and reports malformed commands without injecting input', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  const proc=spawn(fileURLToPath(new URL('../desktop/NativeInputHost.exe',import.meta.url)),[],{windowsHide:true});
  let output='';proc.stdout.on('data',d=>output+=d);
  proc.stdin.end('SEQ 182 UNKNOWN\nSEQ 183 MOVE\nSEQ 184 PING\nSEQ 185 KEYDOWN Code:Unsupported\nSEQ 186 PING\nSEQ 187 STATUS\nEXIT\n');
  assert.equal(await new Promise((resolve,reject)=>{proc.once('exit',resolve);proc.once('error',reject);}),0);
  assert.match(output,/READY/);assert.match(output,/ACK 182 ERR UNKNOWN_COMMAND/);assert.match(output,/ACK 183 ERR INVALID_COMMAND/);assert.match(output,/ACK 184 PONG/);
  assert.match(output,/ACK 185 ERR UNKNOWN_SCAN_CODE/);assert.match(output,/ACK 186 PONG/);
  assert.match(output,/ACK 187 OK STATUS (?:28|40) \d+/,'The production helper must attach to the Windows input desktop and report its actual token integrity without injecting input');
});
