import crypto from 'node:crypto';
import db from './db.js';
import {route,fail,publicUser,visibleUser} from './auth.js';
import {blocked} from './social.js';
import {userSettings,socialRelation,policyAllows} from './settings.js';
import {parseJson} from './permissions.js';
import {validateAssetReferences} from './community-media.js';

export async function conversationAccess(userId,id,tx=db,{send=false}={}) {
  const c=await tx.queryOne('SELECT c.*,p.state FROM dm_conversations c JOIN dm_participants p ON p.conversation_id=c.id WHERE c.id=$1 AND p.user_id=$2 AND p.state IN ($3,$4,$5)',[id,userId,'accepted','requested','spam']) || await tx.queryOne("SELECT c.*,'group' AS kind,p.state FROM dm_groups c JOIN group_members p ON p.conversation_id=c.id WHERE c.id=$1 AND p.user_id=$2 AND p.state='accepted'",[id,userId]);
  if(!c)fail(403,'Conversa privada indisponível');
  const membersTable=c.kind==='group'?'group_members':'dm_participants',messagesTable=c.kind==='group'?'group_messages':'dm_messages';
  const members=await tx.query(`SELECT user_id,state FROM ${membersTable} WHERE conversation_id=$1 AND state IN ('accepted','requested','spam')`,[id]);
  if(send && c.state!=='accepted')fail(403,'Aceite a solicitação antes de responder');
  if(send)for(const p of members)if(p.user_id!==userId && await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[userId,p.user_id]))fail(403,'Conversa bloqueada');
  if(send && c.kind!=='group')for(const p of members)if(p.user_id!==userId){const settings=await userSettings(p.user_id,tx),relation=await socialRelation(userId,p.user_id,tx);if(!policyAllows(settings.dmPolicy,relation) || !relation.friend && relation.shared.length && relation.shared.every(id=>settings.blockedDmServers.includes(id)))fail(403,'Este usuário não permite mensagens privadas de você');}
  return {...c,members,membersTable,messagesTable};
}
export async function bindAttachment(userId,attachment,kind,id,tx=db) {
  if(!attachment)return null;
  const filename=typeof attachment.url==='string'?attachment.url.match(/^\/uploads\/([\w.-]+)$/)?.[1]:null;
  const file=filename && await tx.queryOne('SELECT * FROM upload_records WHERE filename=$1 AND owner_id=$2',[filename,userId]);
  if(!file || file.profile_user_id || file.server_id || file.feature_id || file.channel_id && (kind!=='channels' || file.channel_id!==id) || file.conversation_id && (kind!=='dms' || file.conversation_id!==id))fail(403,'Anexo não pertence a esta conversa');
  await tx.query(`UPDATE upload_records SET ${kind==='channels'?'channel_id':'conversation_id'}=$1 WHERE filename=$2`,[id,filename]);
  return {url:attachment.url,filename:String(attachment.filename || 'arquivo').slice(0,255),mimetype:file.mimetype || 'application/octet-stream',size:Number(file.size_bytes)||0};
}
export function formatDm(m) {
  return {id:m.id,conversationId:m.conversation_id,content:m.deleted_at?'':m.content,attachment:m.deleted_at?null:parseJson(m.attachment,null),metadata:m.deleted_at?{}:parseJson(m.metadata),editedAt:m.edited_at,deletedAt:m.deleted_at,inviteCode:m.deleted_at?null:m.invite_code,reply:m.reply_to?{id:m.reply_to,content:m.reply_deleted?'Mensagem excluída':m.reply_content,username:m.reply_username}:null,timestamp:m.timestamp,sender:{id:m.sender_id,username:m.username,avatar:m.avatar,handle:m.login_name}};
}
export function installConversations(app,io,notify,changed,onBlock=()=>{},onConversationRemoved=()=>{}) {
  const sendTo=(c,event,data)=>{for(const p of c.members){if(data.sender)visibleUser(p.user_id,data.sender).then(sender=>notify([p.user_id],event,{...data,sender})).catch(()=>{});else notify([p.user_id],event,data);}};
  app.get('/api/dms',route(async(req,res)=>{
    const me=req.user.id,rows=[...await db.query("SELECT c.*,p.state FROM dm_conversations c JOIN dm_participants p ON p.conversation_id=c.id WHERE p.user_id=$1 AND p.state IN ('accepted','requested','spam')",[me]),...await db.query("SELECT c.*,'group' AS kind,p.state FROM dm_groups c JOIN group_members p ON p.conversation_id=c.id WHERE p.user_id=$1 AND p.state='accepted'",[me])],output=[];
    for(const c of rows){
      const membersTable=c.kind==='group'?'group_members':'dm_participants',messagesTable=c.kind==='group'?'group_messages':'dm_messages';
      const participants=await db.query(`SELECT u.*,a.login_name,p.state FROM ${membersTable} p JOIN users u ON u.id=p.user_id LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE p.conversation_id=$1 AND p.state IN ('accepted','requested','spam')`,[c.id]);
      const other=participants.find(u=>u.id!==me),read=await db.queryOne('SELECT * FROM conversation_reads WHERE kind=$1 AND context_id=$2 AND user_id=$3',['dms',c.id,me]);
      const unread=await db.queryOne(`SELECT count(*) AS n FROM ${messagesTable} WHERE conversation_id=$1 AND sender_id<>$2 AND deleted_at IS NULL AND timestamp>$3`,[c.id,me,c.kind==='group'?read?.read_at || '1970-01-01':(await db.queryOne('SELECT read_at FROM dm_reads WHERE conversation_id=$1 AND user_id=$2',[c.id,me]))?.read_at || '1970-01-01']);
      let isBlocked=false;for(const p of participants)if(p.id!==me && await blocked(me,p.id))isBlocked=true;
      output.push({id:c.id,kind:c.kind,name:c.name,icon:c.icon,ownerId:c.owner_id,state:c.state,user:other?await visibleUser(me,other):{id:me,username:c.name || 'Grupo',avatar:c.icon},participants:await Promise.all(participants.map(u=>visibleUser(me,u))),blocked:isBlocked,unread:read?.manual_unread?Math.max(1,Number(unread.n)):Number(unread.n),lastMessage:await db.queryOne(`SELECT CASE WHEN deleted_at IS NULL THEN content ELSE 'Mensagem excluída' END AS content,timestamp FROM ${messagesTable} WHERE conversation_id=$1 ORDER BY timestamp DESC,id DESC LIMIT 1`,[c.id])});
    }res.json(output.sort((a,b)=>String(b.lastMessage?.timestamp || '').localeCompare(String(a.lastMessage?.timestamp || ''))));
  }));
  app.post('/api/dms',route(async(req,res)=>{
    const me=req.user.id,target=String(req.body.userId || '');if(me===target || !await db.queryOne("SELECT id FROM users WHERE id=$1 AND account_state='active'",[target]))fail(400,'Conta inválida');const [a,b]=[me,target].sort();
    const c=await db.transaction(async tx=>{
      if(await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[a,b]))fail(403,'Conversa bloqueada');
      const existing=await tx.queryOne("SELECT * FROM dm_conversations WHERE user_low=$1 AND user_high=$2 AND kind='direct'",[a,b]);if(existing){const own=await tx.queryOne('SELECT state FROM dm_participants WHERE conversation_id=$1 AND user_id=$2',[existing.id,me]);if(!own || ['left','ignored'].includes(own.state))fail(403,'Conversa ignorada ou encerrada');return existing;}
      const relation=await socialRelation(me,target,tx),settings=await userSettings(target,tx);
      if(!policyAllows(settings.dmPolicy,relation) || !relation.friend && relation.shared.length && relation.shared.every(id=>settings.blockedDmServers.includes(id)))fail(403,'Este usuário não permite mensagens privadas de você');
      const id=crypto.randomUUID();await tx.query('INSERT INTO dm_conversations(id,user_low,user_high,owner_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_low,user_high) DO NOTHING',[id,a,b,me]);const c=await tx.queryOne('SELECT * FROM dm_conversations WHERE user_low=$1 AND user_high=$2',[a,b]);
      for(const user of [me,target])await tx.query('INSERT INTO dm_participants(conversation_id,user_id,state,joined_at) VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,user_id) DO NOTHING',[c.id,user,user===target && !relation.friend?'requested':'accepted',new Date().toISOString()]);return c;
    });changed(a,b);res.json({id:c.id});
  }));
  app.post('/api/dms/groups',route(async(req,res)=>{
    const me=req.user.id,users=[...new Set(req.body.userIds || [])];if(!Array.isArray(req.body.userIds) || users.length<1 || users.length>20 || users.includes(me))fail(400,'Escolha de 1 a 20 amigos');
    const id=crypto.randomUUID(),name=String(req.body.name || 'Grupo de amigos').slice(0,100);
    await db.transaction(async tx=>{for(const user of users){if(!(await socialRelation(me,user,tx)).friend || await blocked(me,user,tx))fail(403,'Adicione somente amigos não bloqueados');}await tx.query('INSERT INTO dm_groups(id,name,icon,owner_id) VALUES($1,$2,$3,$4)',[id,name,'',me]);for(const user of [me,...users])await tx.query('INSERT INTO group_members(conversation_id,user_id,state,joined_at) VALUES($1,$2,$3,$4)',[id,user,'accepted',new Date().toISOString()]);});notify([me,...users],'social_update',{});res.status(201).json({id});
  }));
  app.patch('/api/dms/:id',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id,db,{send:true});if(c.kind!=='group' || c.owner_id!==req.user.id)fail(403,'Somente o dono pode editar o grupo');const icon=String(req.body.icon || '').slice(0,2000);if(icon && !/^https:\/\//.test(icon) && !await db.queryOne('SELECT filename FROM upload_records WHERE filename=$1 AND owner_id=$2',[icon.slice(9),req.user.id]))fail(403,'Ícone inválido');await db.query('UPDATE dm_groups SET name=$1,icon=$2 WHERE id=$3',[String(req.body.name || c.name).slice(0,100),icon,c.id]);if(icon.startsWith('/uploads/'))await db.query('UPDATE upload_records SET conversation_id=$1 WHERE filename=$2',[c.id,icon.slice(9)]);sendTo(c,'social_update',{});res.sendStatus(204);}));
  app.post('/api/dms/:id/members',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id,db,{send:true}),target=req.body.userId;if(c.kind!=='group' || c.owner_id!==req.user.id || c.members.length>=21 || !(await socialRelation(req.user.id,target)).friend || await blocked(req.user.id,target))fail(403,'Não foi possível adicionar este membro');await db.query('INSERT INTO group_members(conversation_id,user_id,state,joined_at) VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,user_id) DO UPDATE SET state=$3',[c.id,target,'accepted',new Date().toISOString()]);sendTo(c,'social_update',{});notify([target],'social_update',{});res.sendStatus(204);}));
  app.delete('/api/dms/:id/members/:userId',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id),target=req.params.userId;if(c.kind!=='group' || target!==req.user.id && c.owner_id!==req.user.id)fail(403,'Não foi possível remover este membro');await db.transaction(async tx=>{await tx.query("UPDATE group_members SET state='left' WHERE conversation_id=$1 AND user_id=$2",[c.id,target]);if(target===c.owner_id){const next=c.members.find(m=>m.user_id!==target);await tx.query('UPDATE dm_groups SET owner_id=$1 WHERE id=$2',[next?.user_id || null,c.id]);}});onConversationRemoved(c.id,target);sendTo(c,'social_update',{});res.sendStatus(204);}));
  app.put('/api/dms/:id/request',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id);if(!['accept','ignore','spam','block'].includes(req.body.action))fail(400,'Ação inválida');if(req.body.action==='block')for(const p of c.members)if(p.user_id!==req.user.id){await db.transaction(async tx=>{await tx.query('INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,p.user_id]);const[a,b]=[req.user.id,p.user_id].sort();await tx.query('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]);});onBlock(req.user.id,p.user_id);}await db.query('UPDATE dm_participants SET state=$1 WHERE conversation_id=$2 AND user_id=$3',[req.body.action==='accept'?'accepted':req.body.action==='spam'?'spam':'ignored',c.id,req.user.id]);sendTo(c,'social_update',{});res.sendStatus(204);}));
  app.get('/api/dms/:id/messages',route(async(req,res)=>{
    const c=await conversationAccess(req.user.id,req.params.id);let cursor=null;if(req.query.before){cursor=await db.queryOne(`SELECT id,timestamp FROM ${c.messagesTable} WHERE id=$1 AND conversation_id=$2`,[req.query.before,req.params.id]);if(!cursor)fail(400,'Página inválida');}
    const rows=await db.query(`SELECT m.*,u.username,u.avatar,a.login_name,r.content AS reply_content,r.deleted_at AS reply_deleted,ru.username AS reply_username FROM (SELECT * FROM ${c.messagesTable} WHERE conversation_id=$1 ${cursor?'AND (timestamp<$2 OR (timestamp=$2 AND id<$3))':''} ORDER BY timestamp DESC,id DESC LIMIT 100) m JOIN users u ON u.id=m.sender_id LEFT JOIN auth_accounts a ON a.user_id=u.id LEFT JOIN ${c.messagesTable} r ON r.id=m.reply_to LEFT JOIN users ru ON ru.id=r.sender_id ORDER BY m.timestamp,m.id`,cursor?[req.params.id,cursor.timestamp,cursor.id]:[req.params.id]);res.json(await Promise.all(rows.map(async m=>({...formatDm(m),sender:await visibleUser(req.user.id,{...m,id:m.sender_id})}))));
  }));
  app.get('/api/dms/:id/messages/:messageId',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id);const m=await db.queryOne(`SELECT m.*,u.username,u.avatar FROM ${c.messagesTable} m JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND m.conversation_id=$2`,[req.params.messageId,req.params.id]);if(!m)fail(404,'Mensagem indisponível');res.json({...formatDm(m),sender:await visibleUser(req.user.id,{...m,id:m.sender_id})});}));
  app.put('/api/dms/:id/read',route(async(req,res)=>{const c=await conversationAccess(req.user.id,req.params.id);const now=new Date().toISOString();await db.transaction(async tx=>{if(c.kind==='direct')await tx.query('INSERT INTO dm_reads(conversation_id,user_id,read_at) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=$3',[req.params.id,req.user.id,now]);await tx.query("INSERT INTO conversation_reads(kind,context_id,user_id,read_at,manual_unread) VALUES('dms',$1,$2,$3,0) ON CONFLICT(kind,context_id,user_id) DO UPDATE SET read_at=$3,manual_unread=0",[req.params.id,req.user.id,now]);});notify([req.user.id],'social_update',{});res.sendStatus(204);}));
  const attach=socket=>{
    socket.on('dm_send',async(data={},ack=()=>{})=>{try{
      if(typeof data.content!=='string' || data.content.length>4000 || !data.content.trim() && !data.attachment && !data.metadata?.stickerId)fail(400,'Mensagem inválida (máximo 4000 caracteres)');
      const me=socket.data.user.id;
      const result=await db.transaction(async tx=>{
        const c=await conversationAccess(me,data.conversationId,tx,{send:true});
        await validateAssetReferences(me,data.content,null,tx);
        const reply=data.replyTo?await tx.queryOne(`SELECT m.id,m.content,u.username FROM ${c.messagesTable} m JOIN users u ON u.id=m.sender_id WHERE m.id=$1 AND m.conversation_id=$2 AND m.deleted_at IS NULL`,[data.replyTo,c.id]):null;if(data.replyTo && !reply)fail(400,'Resposta pertence a outra conversa ou foi excluída');
        const attachment=await bindAttachment(me,data.attachment,'dms',c.id,tx),m={id:crypto.randomUUID(),conversationId:c.id,sender:socket.data.user,content:data.content,attachment,reply,timestamp:new Date().toISOString()};
        await tx.query(`INSERT INTO ${c.messagesTable}(id,conversation_id,sender_id,content,timestamp,reply_to,attachment) VALUES($1,$2,$3,$4,$5,$6,$7)`,[m.id,c.id,me,m.content,m.timestamp,reply?.id || null,attachment?JSON.stringify(attachment):null]);
        if((m.content.match(/https?:\/\//g) || []).length>=3)await tx.query(`UPDATE ${c.membersTable} SET state='spam' WHERE conversation_id=$1 AND state='requested'`,[c.id]);return {c,m};
      });sendTo(result.c,'dm_message',result.m);sendTo(result.c,'social_update',{});ack({ok:true,id:result.m.id});
    }catch(e){ack({error:e.status?e.message:'Não foi possível enviar a mensagem'});}});
    for(const[event,out]of [['dm_typing_start','dm_typing'],['dm_typing_stop','dm_stop_typing']])socket.on(event,async(data={})=>{try{const c=await conversationAccess(socket.data.user.id,data.conversationId,db,{send:true});notify(c.members.filter(m=>m.user_id!==socket.data.user.id).map(m=>m.user_id),out,{conversationId:c.id,user:socket.data.user});}catch{/* Do not disclose private conversations. */}});
  };
  return {attach};
}
