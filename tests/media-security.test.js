import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validAuthenticatorUri} from '../desktop/authenticator.js';
import {uploadType} from '../server/src/upload-type.js';

test('authenticator launch accepts the application TOTP URI and rejects other schemes or issuers',()=>{
 const valid='otpauth://totp/MeuApp:test?secret=JBSWY3DPEHPK3PXP&issuer=MeuApp';
 assert.equal(validAuthenticatorUri(valid),true);
 for(const uri of [valid.replace('otpauth:','https:'),valid.replace('/MeuApp:','/Other:'),valid.replace('issuer=MeuApp','issuer=Other'),valid.replace('totp/','hotp/'),valid.replace('JBSWY3DPEHPK3PXP','invalid'), 'javascript:alert(1)'])assert.equal(validAuthenticatorUri(uri),false);
});

test('recorded WebM keeps its audio type with codec parameters but spoofed HTML stays a download',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-media-type-'));
 try{
  const file=path.join(dir,'upload');
  await fs.writeFile(file,Buffer.from([26,69,223,163,0,0,0,0]));
  assert.equal(await uploadType(file,'audio/webm;codecs=opus'),'audio/webm');
  assert.equal(await uploadType(file,'video/webm;codecs=vp8'),'video/webm');
  await fs.writeFile(file,'<html><script>alert(1)</script></html>');
  assert.equal(await uploadType(file,'image/png'),'application/octet-stream');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
