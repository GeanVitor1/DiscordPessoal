import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import db from './db.js';
import { runMigrations } from './migrations/index.js';
import { createRealtimeSignaling } from './realtime.js';
import { installAuth,requireAuth,authenticate,route,fail,publicUser,member,owner,channelAccess } from './auth.js';
import { installSocial,blocked } from './social.js';
import { installWeb } from './web.js';

const app=express(), server=http.createServer(app), io=new Server(server,{cors:{origin:'*'}});
app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(cors());app.use(express.json({limit:'32kb'}));
const uploadsDir=fileURLToPath(new URL('../uploads/',import.meta.url));fs.mkdirSync(uploadsDir,{recursive:true});
const activeUsers={},voiceRooms={};
let publishing=Promise.resolve();
function publishPresence() {
  publishing=publishing.then(async()=>{
    for(const socket of io.sockets.sockets.values()) {
      const me=socket.data.user?.id;if(!me) continue;
      const members=await db.query('SELECT server_id FROM server_members WHERE user_id=$1',[me]);
      const allowed=new Set(members.map(x=>x.server_id));
      const channels=await db.query('SELECT id,server_id FROM channels');
      const rooms=Object.fromEntries(Object.entries(voiceRooms).filter(([id])=>allowed.has(channels.find(c=>c.id===id)?.server_id)));
      const visible=[];
      for(const u of Object.values(activeUsers)) {
        if(u.id===me) {visible.push(u);continue;}
        if(await blocked(me,u.id)) continue;
        const shared=await db.queryOne('SELECT a.server_id FROM server_members a JOIN server_members b ON b.server_id=a.server_id WHERE a.user_id=$1 AND b.user_id=$2',[me,u.id]);
        const friend=await db.queryOne("SELECT state FROM friendships WHERE (user_low=$1 AND user_high=$2 OR user_low=$2 AND user_high=$1) AND state='accepted'",[me,u.id]);
        if(shared || friend) visible.push(u);
      }
      socket.emit('users_update',visible);socket.emit('voice_state_update',rooms);
    }
  }).catch(e=>console.error('[Presence]',e.message));
}
const realtime=createRealtimeSignaling(io,voiceRooms,activeUsers,{
  authorizeChannel:async(socket,id)=>!!await channelAccess(socket.data.user.id,id,'voice'),
  publishRooms:publishPresence
});
app.get('/api/health',route(async(req,res)=>{
  const healthy=await db.healthCheck();
  res.status(healthy?200:503).json({status:healthy?'ok':'degraded',database:healthy?'ok':'error',socket:'ok',authentication:'sessions-v1'});
}));
installAuth(app,io);
app.use('/api',requireAuth);
const social=installSocial(app,io,activeUsers,(a,b)=>{realtime.revokeBetweenUsers(a,b);publishPresence();},voiceRooms);
app.get('/api/ice-servers',(req,res)=>{
  const iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}];
  if(process.env.TURN_SECRET && process.env.TURN_SERVER_HOST) {
    const username=`${Math.floor(Date.now()/1000)+3600}:${req.user.id}`;
    const credential=crypto.createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64');
    const base=`${process.env.TURN_SERVER_HOST}:${process.env.TURN_PORT || 3478}`;
    iceServers.push({urls:[`turn:${base}?transport=udp`,`turn:${base}?transport=tcp`],username,credential});
  } else if(process.env.TURN_SERVER_URL && process.env.TURN_USERNAME) iceServers.push({urls:process.env.TURN_SERVER_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL || ''});
  res.json({iceServers,expiresAt:Date.now()+3600000});
});
const upload=multer({storage:multer.diskStorage({destination:uploadsDir,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12))}),limits:{fileSize:10*1024*1024,files:1}});
app.post('/api/upload',upload.single('file'),route(async(req,res)=>{
  if(!req.file) fail(400,'Nenhum arquivo enviado');
  try {await db.query('INSERT INTO upload_records(filename,owner_id) VALUES($1,$2)',[req.file.filename,req.user.id]);}
  catch(e) {fs.unlinkSync(req.file.path);throw e;}
  res.json({url:`/uploads/${req.file.filename}`,filename:req.file.originalname,mimetype:req.file.mimetype,size:req.file.size});
}));
app.get('/uploads/:filename',requireAuth,route(async(req,res)=>{
  if(!/^[\w.-]+$/.test(req.params.filename)) fail(404,'Arquivo indisponível');
  const f=await db.queryOne('SELECT * FROM upload_records WHERE filename=$1',[req.params.filename]);
  if(!f || !(f.owner_id===req.user.id || f.profile_user_id || f.channel_id && await channelAccess(req.user.id,f.channel_id) || f.server_id && await member(req.user.id,f.server_id))) fail(403,'Arquivo indisponível');
  res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.set('X-Content-Type-Options','nosniff');
  res.sendFile(path.join(uploadsDir,f.filename));
}));
async function ownedAsset(user,url,tx=db) {
  if(url==null || url==='') return;
  if(typeof url!=='string' || url.length>2000) fail(400,'Imagem inválida');
  if(/^https:\/\//.test(url)) return;
  const file=url.match(/^\/uploads\/([\w.-]+)$/)?.[1];
  if(!file || !await tx.queryOne('SELECT filename FROM upload_records WHERE filename=$1 AND owner_id=$2',[file,user])) fail(403,'Arquivo pertence a outro usuário');
}
app.post('/api/users/sync',route(async(req,res)=>{
  const b=req.body;
  if(b.id && b.id!==req.user.id) fail(403,'Identidade não pode ser alterada');
  const status=b.status ?? req.user.status;if(!['online','idle','dnd','offline'].includes(status)) fail(400,'Status inválido');
  for(const field of ['username','bio','custom_status']) if(b[field]!=null && (typeof b[field]!=='string' || b[field].length>(field==='bio'?1000:field==='username'?32:128))) fail(400,'Perfil inválido');
  await ownedAsset(req.user.id,b.avatar);await ownedAsset(req.user.id,b.banner);
  await db.transaction(async tx=>{
    await tx.query('UPDATE users SET username=COALESCE($1,username),avatar=COALESCE($2,avatar),banner=COALESCE($3,banner),banner_color=COALESCE($4,banner_color),bio=COALESCE($5,bio),status=$6,custom_status=COALESCE($7,custom_status) WHERE id=$8',[b.username??null,b.avatar??null,b.banner??null,b.banner_color??null,b.bio??null,status,b.custom_status??null,req.user.id]);
    for(const url of [b.avatar,b.banner]) if(url?.startsWith('/uploads/')) await tx.query('UPDATE upload_records SET profile_user_id=$1 WHERE filename=$2 AND owner_id=$1',[req.user.id,url.slice(9)]);
  });
  const user=publicUser(await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[req.user.id]));
  for(const s of io.sockets.sockets.values()) if(s.data.user.id===user.id) {s.data.user=user;activeUsers[s.id]={...user,socketId:s.id};}
  publishPresence();res.json(user);
}));
async function fullServer(s) {return {...s,channels:await db.query('SELECT * FROM channels WHERE server_id=$1 ORDER BY id',[s.id])};}
app.get('/api/servers',route(async(req,res)=>{
  const rows=await db.query('SELECT s.* FROM servers s JOIN server_members m ON m.server_id=s.id WHERE m.user_id=$1 ORDER BY s.created_at',[req.user.id]);
  res.json(await Promise.all(rows.map(fullServer)));
}));
app.post('/api/servers',route(async(req,res)=>{
  const b=req.body,id=crypto.randomUUID();if(typeof b.name!=='string' || !b.name.trim() || b.name.length>100) fail(400,'Nome inválido');
  await ownedAsset(req.user.id,b.banner);
  await db.transaction(async tx=>{
    await tx.query('INSERT INTO servers(id,name,icon,banner,owner_id) VALUES($1,$2,$3,$4,$5)',[id,b.name,b.icon || '',b.banner || '',req.user.id]);
    await tx.query('INSERT INTO server_members(server_id,user_id) VALUES($1,$2)',[id,req.user.id]);
    for(const type of ['text','voice']) await tx.query('INSERT INTO channels(id,server_id,name,type,topic) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),id,type==='text'?'geral':'Geral (Voz)',type,'']);
  });
  const s=await fullServer(await db.queryOne('SELECT * FROM servers WHERE id=$1',[id]));
  if(b.banner?.startsWith('/uploads/')) await db.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2 AND owner_id=$3',[id,b.banner.slice(9),req.user.id]);
  for(const socket of io.sockets.sockets.values()) if(socket.data.user.id===req.user.id) socket.join(`server_${id}`);
  io.to(`server_${id}`).emit('server_created',s);res.status(201).json(s);
}));
app.put('/api/servers/:id',route(async(req,res)=>{
  await owner(req.user.id,req.params.id);await ownedAsset(req.user.id,req.body.banner);
  if(req.body.name!=null && (typeof req.body.name!=='string' || !req.body.name.trim() || req.body.name.length>100)) fail(400,'Nome inválido');
  await db.query('UPDATE servers SET name=COALESCE($1,name),icon=COALESCE($2,icon),banner=COALESCE($3,banner),updated_at=CURRENT_TIMESTAMP WHERE id=$4',[req.body.name??null,req.body.icon??null,req.body.banner??null,req.params.id]);
  const s=await fullServer(await db.queryOne('SELECT * FROM servers WHERE id=$1',[req.params.id]));
  if(req.body.banner?.startsWith('/uploads/')) await db.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2 AND owner_id=$3',[s.id,req.body.banner.slice(9),req.user.id]);
  io.to(`server_${s.id}`).emit('server_updated',s);res.json(s);
}));
app.post('/api/servers/:id/channels',route(async(req,res)=>{
  await owner(req.user.id,req.params.id);
  const b=req.body;if(!['text','voice'].includes(b.type) || typeof b.name!=='string' || !b.name.trim() || b.name.length>100) fail(400,'Canal inválido');
  const c={id:crypto.randomUUID(),server_id:req.params.id,name:b.name.trim(),type:b.type,topic:String(b.topic || '').slice(0,1000)};
  await db.query('INSERT INTO channels(id,server_id,name,type,topic) VALUES($1,$2,$3,$4,$5)',[c.id,c.server_id,c.name,c.type,c.topic]);
  io.to(`server_${c.server_id}`).emit('channel_created',{serverId:c.server_id,channel:c});res.status(201).json(c);
}));
app.post('/api/servers/:id/invites',route(async(req,res)=>{
  await owner(req.user.id,req.params.id);const code=crypto.randomBytes(18).toString('base64url');
  await db.query('INSERT INTO server_invites(code,server_id,created_by,expires_at,max_uses) VALUES($1,$2,$3,$4,$5)',[code,req.params.id,req.user.id,new Date(Date.now()+86400000).toISOString(),25]);res.json({code});
}));
app.post('/api/invites/:code/join',route(async(req,res)=>{
  const serverId=await db.transaction(async tx=>{
    const rows=await tx.query('UPDATE server_invites SET uses=uses+1 WHERE code=$1 AND (expires_at IS NULL OR expires_at>$2) AND (max_uses=0 OR uses<max_uses) RETURNING server_id',[req.params.code,new Date().toISOString()]);
    if(!rows.length) fail(404,'Convite inválido ou expirado');const id=rows[0].server_id;
    await tx.query('INSERT INTO server_members(server_id,user_id) VALUES($1,$2) ON CONFLICT(server_id,user_id) DO NOTHING',[id,req.user.id]);return id;
  });
  const s=await fullServer(await db.queryOne('SELECT * FROM servers WHERE id=$1',[serverId]));
  for(const socket of io.sockets.sockets.values()) if(socket.data.user.id===req.user.id) {socket.join(`server_${serverId}`);socket.emit('server_created',s);}publishPresence();res.json(s);
}));
function formatMessage(m) {
  let attachment=null;try {attachment=m.attachment?JSON.parse(m.attachment):null;}catch{}
  return {id:m.id,channelId:m.channel_id,content:m.content,timestamp:m.timestamp,attachment,reply:m.reply_to?{id:m.reply_to,content:m.reply_content || '',username:m.reply_username || 'Membro'}:null,sender:{id:m.sender_id,username:m.username,discriminator:m.discriminator,avatar:m.avatar || '',banner:m.banner || '',bannerColor:m.banner_color,bio:m.bio || '',customStatus:m.custom_status || '',status:m.status || 'offline'}};
}
app.get('/api/channels/:id/messages',route(async(req,res)=>{
  if(!await channelAccess(req.user.id,req.params.id,'text')) fail(403,'Canal indisponível');
  const rows=await db.query(`SELECT m.*,u.username,u.discriminator,u.avatar,u.banner,u.banner_color,u.bio,u.custom_status,u.status,r.content AS reply_content,ru.username AS reply_username FROM (SELECT * FROM messages WHERE channel_id=$1 ORDER BY timestamp DESC,id DESC LIMIT 100) m LEFT JOIN users u ON u.id=m.sender_id LEFT JOIN messages r ON r.id=m.reply_to LEFT JOIN users ru ON ru.id=r.sender_id ORDER BY m.timestamp,m.id`,[req.params.id]);res.json(rows.map(formatMessage));
}));
io.on('connection',async socket=>{
  const me=socket.data.user.id;
  activeUsers[socket.id]={...socket.data.user,socketId:socket.id};
  socket.join(`user_${me}`);
  // Every packet revalidates expiry/revocation and signaling channel membership.
  let packetTokens=300,packetTime=Date.now();
  socket.use(async([event,data,ack],next)=>{
    const now=Date.now();packetTokens=Math.min(300,packetTokens+(now-packetTime)*.15);packetTime=now;if(packetTokens<1){socket.disconnect(true);return;}packetTokens--;
    try {
      const auth=await authenticate(socket.handshake.auth.token);
      if(!auth) {socket.emit('session_expired');socket.disconnect(true);return;}
      socket.data.user=auth.user;
      if(data?.channelId && !await channelAccess(me,data.channelId)) {if(typeof ack==='function') ack({error:'Canal indisponivel'});return;}
      if(data?.targetSocketId) {const other=activeUsers[data.targetSocketId];if(!other || await blocked(me,other.id)) {if(typeof ack==='function') ack({error:'Participante indisponivel'});return;}}
      next();
    }catch(e){next(e);}
  });
  const joined=async()=>{
    if(!socket.connected) return;
    const user=publicUser(await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[me]));
    if(!socket.connected) return;socket.data.user=user;activeUsers[socket.id]={...user,socketId:socket.id};
    for(const m of await db.query('SELECT server_id FROM server_members WHERE user_id=$1',[me])) socket.join(`server_${m.server_id}`);
    publishPresence();
  };
  socket.on('user_join',joined);
  socket.on('status_change',async status=>{
    if(!['online','idle','dnd','offline'].includes(status)) return;
    await db.query('UPDATE users SET status=$1 WHERE id=$2',[status,me]);await joined();
  });
  socket.on('send_message',async(data={},ack=()=>{})=>{
    try {
      if(typeof data.content!=='string' || data.content.length>4000 || (!data.content.trim() && !data.attachment)) fail(400,'Mensagem inválida');
      const c=await channelAccess(me,data.channelId,'text');if(!c) fail(403,'Canal indisponível');
      const reply=data.replyTo?await db.queryOne('SELECT m.id,m.content,u.username FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND m.channel_id=$2',[data.replyTo,c.id]):null;
      if(data.replyTo && !reply) fail(400,'Resposta pertence a outro canal');
      let attachment=null;
      if(data.attachment) {
        await ownedAsset(me,data.attachment.url);
        if(!data.attachment.url?.startsWith('/uploads/')) fail(400,'Anexo inválido');
        const f=await db.queryOne('SELECT * FROM upload_records WHERE filename=$1 AND owner_id=$2',[data.attachment.url.slice(9),me]);
        if(f.channel_id && f.channel_id!==c.id || f.profile_user_id || f.server_id) fail(403,'Arquivo já vinculado a outro contexto');
        attachment={url:data.attachment.url,filename:String(data.attachment.filename || 'arquivo').slice(0,255),mimetype:String(data.attachment.mimetype || '').slice(0,128),size:Number(data.attachment.size)||0};
      }
      const m={id:crypto.randomUUID(),channelId:c.id,sender:socket.data.user,content:data.content,attachment,reply,timestamp:new Date().toISOString()};
      await db.transaction(async tx=>{
        await tx.query('INSERT INTO messages(id,channel_id,sender_id,content,attachment,timestamp,reply_to) VALUES($1,$2,$3,$4,$5,$6,$7)',[m.id,c.id,me,m.content,attachment?JSON.stringify(attachment):null,m.timestamp,reply?.id || null]);
        if(attachment) await tx.query('UPDATE upload_records SET channel_id=$1 WHERE filename=$2 AND owner_id=$3',[c.id,attachment.url.slice(9),me]);
      });
      io.to(`server_${c.server_id}`).emit('new_message',m);ack({ok:true,id:m.id});
    }catch(e){ack({error:e.status?e.message:'Não foi possível salvar a mensagem'});}
  });
  for(const [event,out] of [['typing_start','user_typing'],['typing_stop','user_stop_typing']]) socket.on(event,async(data={})=>{
    const c=await channelAccess(me,data.channelId,'text');if(c) socket.to(`server_${c.server_id}`).emit(out,{channelId:c.id,user:socket.data.user,userId:me});
  });
  realtime.attach(socket);social.attach(socket);
  socket.on('disconnect',()=>{delete activeUsers[socket.id];publishPresence();});
  await joined();
});
installWeb(app);
app.use((err,req,res,next)=>{
  if(res.headersSent) return next(err);
  const status=err.status || (err.code==='LIMIT_FILE_SIZE'?400:500);
  if(status===500) console.error('[Request failed]',err.message);
  res.status(status).json({error:status===500?'Erro interno':err.message});
});
await runMigrations(db);
server.listen(process.env.PORT || 5000,process.env.HOST || '0.0.0.0',()=>console.log('[Backend] Authenticated API ready'));
