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
import { installAuth,requireAuth,authenticate,route,fail,publicUser,visibleUser,member,owner,channelAccess } from './auth.js';
import { installSocial,blocked } from './social.js';
import { installWeb } from './web.js';
import { installConversationTools } from './conversation-tools.js';
import {installAccounts} from './accounts.js';
import {installCommunity,serverView} from './community.js';
import {requirePermission,audit,DEFAULT_PERMISSIONS,accessibleChannel} from './permissions.js';
import {conversationAccess} from './conversations.js';
import {userSettings,socialRelation,policyAllows} from './settings.js';
import {installMessageFeatures} from './message-features.js';
import {installCommunityMedia,assetAccess,validateAssetReferences} from './community-media.js';
import {installLinkPreview} from './link-preview.js';
import {installPrivateCalls} from './private-calls.js';
import {voiceModerator} from './voice-moderation.js';
import {uploadType} from './upload-type.js';
import {validateMessageContent} from './message-validation.js';
import {rolesFor} from './permissions.js';
import {installMentions} from './mentions.js';
import {installSoundboard} from './soundboard.js';
import {installNotifications} from './notifications.js';
import {visibleServerUser,installProfiles} from './profiles.js';

const app=express(), server=http.createServer(app), io=new Server(server,{cors:{origin:'*'}});
app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(cors());app.use(express.json({limit:'32kb'}));
const uploadsDir=fileURLToPath(new URL('../uploads/',import.meta.url));fs.mkdirSync(uploadsDir,{recursive:true});
const activeUsers={},voiceRooms={};
let privateCalls;
let moderateVoice;
let publishing=Promise.resolve();
function publishPresence() {
  publishing=publishing.then(async()=>{
    for(const socket of io.sockets.sockets.values()) {
      const me=socket.data.user?.id;if(!me) continue;
      const members=await db.query('SELECT m.server_id FROM server_members m JOIN servers s ON s.id=m.server_id WHERE m.user_id=$1 AND s.deleted_at IS NULL',[me]);
      const allowed=new Set(members.map(x=>x.server_id));
      const channels=await db.query('SELECT id,server_id FROM channels');
      const rooms={};for(const[id,people]of Object.entries(voiceRooms))if((id.startsWith('dm:') || allowed.has(channels.find(c=>c.id===id)?.server_id)) && await channelAccess(me,id))rooms[id]=await Promise.all(people.map(async p=>({...p,user:await visibleServerUser(me,p.user,channels.find(c=>c.id===id)?.server_id)})));
      const visible=[];
      for(const u of Object.values(activeUsers)) {
        if(u.id===me) {visible.push(u);continue;}
        if(await blocked(me,u.id)) continue;
        const shared=await db.queryOne('SELECT a.server_id FROM server_members a JOIN server_members b ON b.server_id=a.server_id WHERE a.user_id=$1 AND b.user_id=$2',[me,u.id]);
        const friend=await db.queryOne("SELECT state FROM friendships WHERE (user_low=$1 AND user_high=$2 OR user_low=$2 AND user_high=$1) AND state='accepted'",[me,u.id]);
        if(shared || friend) visible.push({...await visibleUser(me,u),socketId:u.socketId});
      }
      socket.emit('users_update',visible);socket.emit('voice_state_update',rooms);
    }
  }).catch(e=>console.error('[Presence]',e.message));
}
const realtime=createRealtimeSignaling(io,voiceRooms,activeUsers,{
  authorizeChannel:async(socket,id)=>await channelAccess(socket.data.user.id,id,'voice','connect'),
  moderateVoice:(socket,data)=>moderateVoice(socket,data),
  onLeave:(_socket,id)=>privateCalls?.scheduleEmpty(id),
  onJoin:(_socket,id)=>privateCalls?.joined(id),
  publishRooms:publishPresence
});
moderateVoice=voiceModerator(io,voiceRooms,realtime,publishPresence);
app.get('/api/health',route(async(req,res)=>{
  const healthy=await db.healthCheck();
  res.status(healthy?200:503).json({status:healthy?'ok':'degraded',database:healthy?'ok':'error',socket:'ok',authentication:'sessions-v1',assistanceProtocol:2});
}));
installAuth(app,io);
installAccounts(app,io,activeUsers,publishPresence);
app.use('/api',requireAuth);
installNotifications(app,io);
installSoundboard(app,io,realtime,voiceRooms);
const social=installSocial(app,io,activeUsers,(a,b)=>{realtime.revokeBetweenUsers(a,b);privateCalls?.revokeBetweenUsers(a,b).catch(()=>{});publishPresence();},voiceRooms,(conversationId,userId)=>{for(const s of io.sockets.sockets.values())if(s.data.user.id===userId && realtime.roomOf(s.id)===`dm:${conversationId}`){realtime.leave(s);s.emit('voice_removed',{reason:'Você saiu ou foi removido do grupo'});}});
privateCalls=installPrivateCalls(app,io,voiceRooms,realtime);
const community=installCommunity(app,io,activeUsers,realtime,publishPresence);
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
  req.file.mimetype=await uploadType(req.file.path,req.file.mimetype);
  try {await db.query('INSERT INTO upload_records(filename,owner_id,mimetype,size_bytes) VALUES($1,$2,$3,$4)',[req.file.filename,req.user.id,req.file.mimetype,req.file.size]);}
  catch(e) {fs.unlinkSync(req.file.path);throw e;}
  res.json({url:`/uploads/${req.file.filename}`,filename:req.file.originalname,mimetype:req.file.mimetype,size:req.file.size});
}));
app.get('/uploads/:filename',requireAuth,route(async(req,res)=>{
  if(!/^[\w.-]+$/.test(req.params.filename)) fail(404,'Arquivo indisponível');
  const f=await db.queryOne('SELECT * FROM upload_records WHERE filename=$1',[req.params.filename]);
  let profileAllowed=false;if(f?.profile_user_id){const p=await userSettings(f.profile_user_id);profileAllowed=!await blocked(req.user.id,f.profile_user_id) && policyAllows(p.profileVisibility,await socialRelation(req.user.id,f.profile_user_id));}
  let dmAllowed=false;if(f?.conversation_id)try{await conversationAccess(req.user.id,f.conversation_id);dmAllowed=true;}catch{}
  const featureAllowed=f?.feature_id && await assetAccess(req.user.id,f.feature_id);
  if(!f || !(f.owner_id===req.user.id || profileAllowed || dmAllowed || featureAllowed || f.channel_id && await channelAccess(req.user.id,f.channel_id) || f.server_id && await member(req.user.id,f.server_id))) fail(403,'Arquivo indisponível');
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
async function fullServer(s,userId) {return serverView(userId || s.owner_id,s.id);}
app.get('/api/servers',route(async(req,res)=>{
  const rows=await db.query('SELECT s.* FROM servers s JOIN server_members m ON m.server_id=s.id WHERE m.user_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at',[req.user.id]);
  res.json(await Promise.all(rows.map(s=>fullServer(s,req.user.id))));
}));
app.post('/api/servers',route(async(req,res)=>{
  const b=req.body,id=crypto.randomUUID();if(typeof b.name!=='string' || !b.name.trim() || b.name.length>100) fail(400,'Nome inválido');
  await ownedAsset(req.user.id,b.banner);
  await db.transaction(async tx=>{
    await tx.query('INSERT INTO servers(id,name,icon,banner,owner_id) VALUES($1,$2,$3,$4,$5)',[id,b.name,b.icon || '',b.banner || '',req.user.id]);
    await tx.query('INSERT INTO server_members(server_id,user_id) VALUES($1,$2)',[id,req.user.id]);
    await tx.query('INSERT INTO roles(id,server_id,name,permissions,is_default) VALUES($1,$2,$3,$4,1)',[`everyone:${id}`,id,'@everyone',JSON.stringify(DEFAULT_PERMISSIONS)]);
    await audit(tx,id,req.user.id,'server.create',id);
    for(const type of ['text','voice']) await tx.query('INSERT INTO channels(id,server_id,name,type,topic) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),id,type==='text'?'geral':'Geral (Voz)',type,'']);
  });
  const s=await fullServer(await db.queryOne('SELECT * FROM servers WHERE id=$1',[id]));
  if(b.banner?.startsWith('/uploads/')) await db.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2 AND owner_id=$3',[id,b.banner.slice(9),req.user.id]);
  for(const socket of io.sockets.sockets.values()) if(socket.data.user.id===req.user.id) socket.join(`server_${id}`);
  io.to(`server_${id}`).emit('server_created',s);await community.refresh(id);res.status(201).json(s);
}));
app.put('/api/servers/:id',route(async(req,res)=>{
  await requirePermission(req.user.id,req.params.id,'manageServer');await ownedAsset(req.user.id,req.body.banner);
  if(req.body.name!=null && (typeof req.body.name!=='string' || !req.body.name.trim() || req.body.name.length>100)) fail(400,'Nome inválido');
  await db.query('UPDATE servers SET name=COALESCE($1,name),icon=COALESCE($2,icon),banner=COALESCE($3,banner),updated_at=CURRENT_TIMESTAMP WHERE id=$4',[req.body.name??null,req.body.icon??null,req.body.banner??null,req.params.id]);
  const s=await fullServer(await db.queryOne('SELECT * FROM servers WHERE id=$1',[req.params.id]));
  if(req.body.banner?.startsWith('/uploads/')) await db.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2 AND owner_id=$3',[s.id,req.body.banner.slice(9),req.user.id]);
  await db.transaction(tx=>audit(tx,s.id,req.user.id,'server.update',s.id));await community.refresh(s.id);res.json(await serverView(req.user.id,s.id));
}));
app.post('/api/servers/:id/channels',route(async(req,res)=>{
  await requirePermission(req.user.id,req.params.id,'manageChannels');
  const b=req.body;if(!['text','voice'].includes(b.type) || typeof b.name!=='string' || !b.name.trim() || b.name.length>100) fail(400,'Canal inválido');
  const c={id:crypto.randomUUID(),server_id:req.params.id,name:b.name.trim(),type:b.type,topic:String(b.topic || '').slice(0,1000)};
  await db.query('INSERT INTO channels(id,server_id,name,type,topic) VALUES($1,$2,$3,$4,$5)',[c.id,c.server_id,c.name,c.type,c.topic]);
  await db.transaction(tx=>audit(tx,c.server_id,req.user.id,'channel.create',c.id));await community.refresh(c.server_id);res.status(201).json(await accessibleChannel(req.user.id,c.id));
}));
installConversationTools(app,io,publishPresence);
installMessageFeatures(app,io);installMentions(app);
installCommunityMedia(app,io);
installProfiles(app,io,publishPresence);
installLinkPreview(app);
function formatMessage(m) {
  let attachment=null;try {attachment=!m.deleted_at && m.attachment?JSON.parse(m.attachment):null;}catch{}
  return {id:m.id,channelId:m.channel_id,content:m.deleted_at?'':m.content,deletedAt:m.deleted_at,editedAt:m.edited_at,timestamp:m.timestamp,attachment,reply:m.reply_to?{id:m.reply_to,content:m.reply_deleted?'Mensagem excluída':m.reply_content || '',username:m.reply_username || 'Membro'}:null,sender:{id:m.sender_id,username:m.username,discriminator:m.discriminator,avatar:m.avatar || '',banner:m.banner || '',bannerColor:m.banner_color,bio:m.bio || '',customStatus:m.custom_status || '',status:m.status || 'offline'}};
}
app.get('/api/channels/:id/messages',route(async(req,res)=>{
  if(!await channelAccess(req.user.id,req.params.id,'text','readHistory')) fail(403,'Canal indisponível');
  let cursor=null;
  if(req.query.before) {cursor=await db.queryOne('SELECT id,timestamp FROM messages WHERE id=$1 AND channel_id=$2',[req.query.before,req.params.id]);if(!cursor) fail(400,'Página inválida');}
  const rows=await db.query(`SELECT m.*,u.username,u.discriminator,u.avatar,u.banner,u.banner_color,u.bio,u.custom_status,u.status,r.content AS reply_content,r.deleted_at AS reply_deleted,ru.username AS reply_username FROM (SELECT * FROM messages WHERE channel_id=$1 ${cursor?'AND (timestamp<$2 OR (timestamp=$2 AND id<$3))':''} ORDER BY timestamp DESC,id DESC LIMIT 100) m LEFT JOIN users u ON u.id=m.sender_id LEFT JOIN messages r ON r.id=m.reply_to LEFT JOIN users ru ON ru.id=r.sender_id ORDER BY m.timestamp,m.id`,cursor?[req.params.id,cursor.timestamp,cursor.id]:[req.params.id]);res.json(await Promise.all(rows.map(async row=>{const m=formatMessage(row);m.sender=await visibleServerUser(req.user.id,m.sender,(await channelAccess(req.user.id,req.params.id)).server_id);return m;})));
}));
app.get('/api/channels/:id/search',route(async(req,res)=>{
  if(!await channelAccess(req.user.id,req.params.id,'text','readHistory')) fail(403,'Canal indisponível');
  const q=String(req.query.q || '').trim();if(!q || q.length>200) fail(400,'Busca inválida');
  const rows=await db.query(`SELECT m.*,u.username,u.avatar FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.channel_id=$1 AND m.deleted_at IS NULL AND LOWER(m.content) LIKE $2 ESCAPE '!' ORDER BY m.timestamp DESC,m.id DESC LIMIT 100`,[req.params.id,'%'+q.toLowerCase().replace(/[!%_]/g,c=>'!'+c)+'%']);res.json(await Promise.all(rows.map(async row=>{const m=formatMessage(row);m.sender=await visibleServerUser(req.user.id,m.sender,(await channelAccess(req.user.id,req.params.id)).server_id);return m;})));
}));
app.get('/api/channels/:id/messages/:messageId',route(async(req,res)=>{
  if(!await channelAccess(req.user.id,req.params.id,'text','readHistory')) fail(403,'Canal indisponível');
  const m=await db.queryOne('SELECT m.*,u.username,u.avatar FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND m.channel_id=$2 AND m.deleted_at IS NULL',[req.params.messageId,req.params.id]);
  if(!m) fail(404,'Mensagem indisponível');const formatted=formatMessage(m);formatted.sender=await visibleUser(req.user.id,formatted.sender);res.json(formatted);
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
    for(const m of await db.query('SELECT server_id FROM server_members WHERE user_id=$1',[me])) {socket.join(`server_${m.server_id}`);const view=await serverView(me,m.server_id);for(const c of view?.channels || [])socket.join(`channel_${c.id}`);}
    publishPresence();
  };
  socket.on('user_join',joined);
  socket.on('status_change',async status=>{
    if(!['online','idle','dnd','offline'].includes(status)) return;
    await db.query('UPDATE users SET status=$1 WHERE id=$2',[status,me]);await joined();
  });
  let runtimeLast=0;
  socket.on('presence_runtime',async(data={})=>{try{if(Date.now()-runtimeLast<5000)return;runtimeLast=Date.now();const settings=await userSettings(me),u=await db.queryOne('SELECT status,activity,activity_started FROM users WHERE id=$1',[me]);let activity=settings.allowActivity&&typeof data.activity==='string'?data.activity.slice(0,128):'';let started=activity?(activity===u.activity?u.activity_started:new Date().toISOString()):null;if(activity && Number.isFinite(Date.parse(data.startedAt)) && Date.parse(data.startedAt)<=Date.now())started=new Date(data.startedAt).toISOString();await db.query('UPDATE users SET activity=$1,activity_started=$2 WHERE id=$3',[activity,started,me]);await joined();if(data.idle===true && u.status==='online'){socket.data.user.status='idle';activeUsers[socket.id].status='idle';publishPresence();}}catch{/* Keep persisted manual presence if activity fails. */}});
  socket.on('send_message' ,async(data={},ack=()=>{})=>{
    try {
      if(typeof data.content!=='string' || data.content.length>4000 || (!data.content.trim() && !data.attachment)) fail(400,'Mensagem inválida');
      const c=await channelAccess(me,data.channelId,'text','sendMessages');if(!c) fail(403,'Você não pode enviar mensagens neste canal');
      if(c.slowmode){const last=await db.queryOne('SELECT timestamp FROM messages WHERE channel_id=$1 AND sender_id=$2 ORDER BY timestamp DESC LIMIT 1',[c.id,me]);if(last && Date.now()-Date.parse(last.timestamp)<c.slowmode*1000 && !c.permissions.manageMessages)fail(429,'Aguarde o modo lento antes de enviar outra mensagem');}
      if(data.attachment && !c.permissions.attachFiles)fail(403,'Anexos não são permitidos neste canal');
      if(/https?:\/\//i.test(data.content) && !c.permissions.embedLinks)fail(403,'Links não são permitidos neste canal');
      if(/@(everyone|here)\b/.test(data.content) && !c.permissions.mentionEveryone)fail(403,'Você não pode mencionar todos');
      if(/@[^\s]+/.test(data.content) && !c.permissions.mentionUsers)fail(403,'Menções não são permitidas');
      if(/^\//.test(data.content) && !c.permissions.useCommands)fail(403,'Comandos não são permitidos');
      if(data.attachment?.mimetype==='image/gif' && !c.permissions.useGifs)fail(403,'GIFs não são permitidos');
      await validateMessageContent(me,data.content,c);
      const reply=data.replyTo?await db.queryOne('SELECT m.id,m.content,u.username FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND m.channel_id=$2 AND m.deleted_at IS NULL',[data.replyTo,c.id]):null;
      if(data.replyTo && !reply) fail(400,'Resposta pertence a outro canal');
      let attachment=null;
      if(data.attachment) {
        await ownedAsset(me,data.attachment.url);
        if(!data.attachment.url?.startsWith('/uploads/')) fail(400,'Anexo inválido');
        const f=await db.queryOne('SELECT * FROM upload_records WHERE filename=$1 AND owner_id=$2',[data.attachment.url.slice(9),me]);
        if(f.channel_id && f.channel_id!==c.id || f.profile_user_id || f.server_id || f.feature_id || f.conversation_id) fail(403,'Arquivo já vinculado a outro contexto');
        if(f.mimetype==='image/gif' && !c.permissions.useGifs)fail(403,'GIFs não são permitidos');
        attachment={url:data.attachment.url,filename:String(data.attachment.filename || 'arquivo').slice(0,255),mimetype:f.mimetype || 'application/octet-stream',size:Number(f.size_bytes)||0};
      }
      const m={id:crypto.randomUUID(),channelId:c.id,serverId:c.server_id,sender:socket.data.user,content:data.content,attachment,reply,timestamp:new Date().toISOString()};
      await db.transaction(async tx=>{
        if(tx.isPostgres)await tx.query('SELECT id FROM channels WHERE id=$1 FOR UPDATE',[c.id]);const checked=await accessibleChannel(me,c.id,'text','sendMessages',tx);if(!checked)fail(403,'Canal indisponível');if(checked.slowmode){const last=await tx.queryOne('SELECT timestamp FROM messages WHERE channel_id=$1 AND sender_id=$2 ORDER BY timestamp DESC LIMIT 1',[c.id,me]);if(last && Date.now()-Date.parse(last.timestamp)<checked.slowmode*1000 && !checked.permissions.manageMessages)fail(429,'Aguarde o modo lento');}
        await tx.query('INSERT INTO messages(id,channel_id,sender_id,content,attachment,timestamp,reply_to) VALUES($1,$2,$3,$4,$5,$6,$7)',[m.id,c.id,me,m.content,attachment?JSON.stringify(attachment):null,m.timestamp,reply?.id || null]);
        if(attachment) await tx.query('UPDATE upload_records SET channel_id=$1 WHERE filename=$2 AND owner_id=$3',[c.id,attachment.url.slice(9),me]);
      });
      for(const receiver of io.sockets.sockets.values())if(receiver.rooms.has(`channel_${c.id}`))receiver.emit('new_message',{...m,mentioned:m.content.includes(`<@${receiver.data.user.id}>`) || (await rolesFor(receiver.data.user.id,c.server_id)).some(r=>m.content.includes(`<@&${r.id}>`)),sender:await visibleServerUser(receiver.data.user.id,m.sender,c.server_id)});ack({ok:true,id:m.id});
    }catch(e){ack({error:e.status?e.message:'Não foi possível salvar a mensagem'});}
  });
  for(const [event,out] of [['typing_start','user_typing'],['typing_stop','user_stop_typing']]) socket.on(event,async(data={})=>{
    const c=await channelAccess(me,data.channelId,'text','sendMessages');if(c) socket.to(`channel_${c.id}`).emit(out,{channelId:c.id,user:socket.data.user,userId:me});
  });
  realtime.attach(socket);social.attach(socket);privateCalls.attach(socket);
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
await privateCalls.restore();
server.listen(process.env.PORT || 5000,process.env.HOST || '0.0.0.0',()=>console.log('[Backend] Authenticated API ready'));
