import crypto from 'node:crypto';
import {promisify} from 'node:util';
import nodemailer from 'nodemailer';

const scrypt=promisify(crypto.scrypt);
export const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
export const passwordHash=async(password,salt)=>(await scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');
export const validPassword=value=>typeof value==='string' && value.length>=12 && value.length<=256;
export const equalHash=(a,b)=>typeof a==='string' && typeof b==='string' && a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function checkPassword(account,password) {return validPassword(password) && equalHash(await passwordHash(password,account.password_salt),account.password_hash);}
export function base32(buffer) {let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value<<(5-bits))&31];return out;}
function fromBase32(secret) {let bits=0,value=0,out=[];for(const char of secret){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);if(n<0)throw Error('Invalid TOTP secret');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,step=Math.floor(Date.now()/30000),digits=6,algorithm='sha1') {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac(algorithm,fromBase32(secret)).update(counter).digest(),offset=h[h.length-1]&15;
  return ((h.readUInt32BE(offset)&0x7fffffff)%10**digits).toString().padStart(digits,'0');
}
export function verifyTotp(secret,code,lastStep=-1,now=Date.now()) {
  if(!/^\d{6}$/.test(String(code)))return null;
  const current=Math.floor(now/30000);
  for(const step of [current,current-1,current+1]) if(step>Number(lastStep??-1) && equalHash(totp(secret,step),String(code)))return step;
  return null;
}
export const mailConfigured=()=>!!(process.env.SMTP_HOST && process.env.MAIL_FROM);
export async function sendAccountMail(address,token,purpose) {
  if(!mailConfigured()){const e=Error('O envio de e-mails ainda precisa ser configurado no servidor');e.status=503;throw e;}
  const port=Number(process.env.SMTP_PORT || 587),secure=port===465;
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure,requireTLS:!secure && process.env.NODE_ENV!=='test',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
  const title=purpose==='reset'?'Recuperar senha':'Confirmar e-mail';
  const origin=process.env.PUBLIC_APP_URL;
  const link=origin && /^https:\/\//.test(origin)?`${origin.replace(/\/$/,'')}/?accountAction=${purpose}&token=${encodeURIComponent(token)}`:null;
  try{await transport.sendMail({from:process.env.MAIL_FROM,to:address,subject:`MeuApp · ${title}`,text:`${title}\n\n${link || `Código: ${token}`}\n\nVálido por 30 minutos. Se você não solicitou esta operação, ignore esta mensagem.`});}finally{transport.close();}
}
