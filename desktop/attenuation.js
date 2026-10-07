import {spawn} from 'node:child_process';
import fs from 'node:fs';
export class AudioAttenuation {
 constructor({helper,excluded=()=>[process.pid],onError=()=>{}}){Object.assign(this,{helper,excluded,onError});this.process=null;}
 update(amount){if(!Number.isFinite(amount) || amount<0 || amount>1)return false;if(!amount && !this.process)return true;
  if(!this.process){if(!fs.existsSync(this.helper)){this.onError('AudioSessionHost ausente');return false;}const child=spawn(this.helper,[`--exclude=${this.excluded().join(',')}`],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.process=child;child.stdout.on('data',data=>{if(String(data).includes('ERROR'))this.onError('Atenuação indisponível');});child.stderr.on('data',()=>{});child.on('error',()=>this.onError('Não foi possível iniciar a atenuação'));child.on('exit',()=>{if(this.process===child)this.process=null;});child.stdin.on('error',()=>{});}
  if(!this.process.stdin.writable)return false;this.process.stdin.write(amount?`DUCK ${amount.toFixed(3)}\n`:'RESTORE\n');return true;
 }
 close(){const child=this.process;this.process=null;if(child?.stdin.writable)child.stdin.end('EXIT\n');}
}
