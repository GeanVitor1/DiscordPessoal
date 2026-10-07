import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import db from './db.js';
import {route,fail,channelAccess} from './auth.js';
import {assetAccess} from './community-media.js';
const uploads=fileURLToPath(new URL('../uploads/',import.meta.url));
export function installSoundboard(app,io,realtime,voiceRooms){const plays=new Map(),last=new Map();
 app.post('/api/soundboard/play',route(async(req,res)=>{
  const socket=io.sockets.sockets.get(req.body.socketId);if(socket?.data.user.id!==req.user.id)fail(403,'Entre em uma chamada');const channelId=realtime.roomOf(socket.id),channel=channelId && await channelAccess(req.user.id,channelId,'voice','useSoundboard');if(!channel)fail(403,'Soundboard não permitido');if(Date.now()-(last.get(req.user.id)||0)<3000)fail(429,'Aguarde antes de tocar outro som');
  const asset=await assetAccess(req.user.id,req.body.assetId),file=asset?.url.match(/^\/uploads\/([\w.-]+)$/)?.[1],upload=file && await db.queryOne('SELECT mimetype FROM upload_records WHERE filename=$1',[file]);if(!asset || asset.kind!=='sound' || !file || !upload?.mimetype?.startsWith('audio/'))fail(400,'Escolha um arquivo de áudio');
  const id=crypto.randomUUID();last.set(req.user.id,Date.now());plays.set(id,{channelId,file,until:Date.now()+60000,users:new Set((voiceRooms[channelId] || []).map(p=>p.user.id))});io.to(`voice_${channelId}`).emit('soundboard_play',{id,url:`/api/soundboard/${id}`,name:asset.name,userId:req.user.id,channelId});res.json({ok:true});
 }));
 app.get('/api/soundboard/:id',route(async(req,res)=>{const play=plays.get(req.params.id);if(!play || play.until<Date.now() || !play.users.has(req.user.id) || !Object.values(voiceRooms).flat().some(p=>p.user.id===req.user.id && realtime.roomOf(p.socketId)===play.channelId))fail(403,'Reprodução expirada');res.sendFile(path.join(uploads,play.file));}));
 const timer=setInterval(()=>{for(const[id,p]of plays)if(p.until<Date.now())plays.delete(id);for(const[id,time]of last)if(time<Date.now()-60000)last.delete(id);},30000);timer.unref();return {close:()=>clearInterval(timer)};
}
