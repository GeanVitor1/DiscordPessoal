import crypto from 'node:crypto';
import db from './db.js';
import {route,fail,member,channelAccess} from './auth.js';
import {blocked} from './social.js';
import {requirePermission,audit} from './permissions.js';
import {serverView} from './community.js';
import {conversationAccess} from './conversations.js';
import {accessibleChannel} from './permissions.js';
import {validateMessageContent} from './message-validation.js';
import {validateAssetReferences} from './community-media.js';

export function installConversationTools(app,io,publishPresence=()=>{}) {
  app.post('/api/servers/:id/invites',route(async(req,res)=>{
    await requirePermission(req.user.id,req.params.id,'createInvite');
    const duration=req.body.expiresIn ?? 86400,max=req.body.maxUses ?? 25;
    if(![0,3600,86400,604800].includes(duration) || ![0,1,5,10,25,100].includes(max)) fail(400,'Limites do convite inválidos');
    const code=crypto.randomBytes(18).toString('base64url'),expiresAt=duration?new Date(Date.now()+duration*1000).toISOString():null;
    await db.query('INSERT INTO server_invites(code,server_id,created_by,expires_at,max_uses) VALUES($1,$2,$3,$4,$5)',[code,req.params.id,req.user.id,expiresAt,max]);
    await db.transaction(tx=>audit(tx,req.params.id,req.user.id,'invite.create',code));
    res.status(201).json({code,expiresAt,maxUses:max});
  }));
  app.get('/api/servers/:id/invites',route(async(req,res)=>{
    const membership=await member(req.user.id,req.params.id);if(!membership) fail(403,'Servidor indisponível');
    const s=await db.queryOne('SELECT owner_id FROM servers WHERE id=$1',[req.params.id]);
    res.json(await db.query('SELECT i.*,u.username AS creator_name FROM server_invites i LEFT JOIN users u ON u.id=i.created_by WHERE i.server_id=$1 AND (i.created_by=$2 OR $3=1) ORDER BY i.created_at DESC',[req.params.id,req.user.id,s.owner_id===req.user.id?1:0]));
  }));
  app.delete('/api/servers/:id/invites/:code',route(async(req,res)=>{
    if(!await member(req.user.id,req.params.id)) fail(403,'Servidor indisponível');
    const s=await db.queryOne('SELECT owner_id FROM servers WHERE id=$1',[req.params.id]);
    const rows=await db.query('UPDATE server_invites SET revoked_at=$1 WHERE server_id=$2 AND code=$3 AND (created_by=$4 OR $5=1) RETURNING code',[new Date().toISOString(),req.params.id,req.params.code,req.user.id,s.owner_id===req.user.id?1:0]);
    if(!rows.length) fail(403,'Convite indisponível');res.sendStatus(204);
  }));
  async function available(code,tx=db) {
    const invite=await tx.queryOne('SELECT i.* FROM server_invites i JOIN servers s ON s.id=i.server_id WHERE i.code=$1 AND i.revoked_at IS NULL AND s.deleted_at IS NULL AND (i.expires_at IS NULL OR i.expires_at>$2)',[code,new Date().toISOString()]);
    if(!invite || invite.max_uses && invite.uses>=invite.max_uses) fail(404,'Convite inválido, esgotado ou expirado');return invite;
  }
  app.get('/api/invites/:code',route(async(req,res)=>{
    const i=await available(req.params.code);
    const s=await db.queryOne('SELECT id,name,icon FROM servers WHERE id=$1',[i.server_id]);
    const count=await db.queryOne('SELECT count(*) AS n FROM server_members WHERE server_id=$1',[i.server_id]);
    res.json({code:i.code,server:s,members:Number(count.n),expiresAt:i.expires_at,maxUses:i.max_uses,alreadyMember:!!await member(req.user.id,s.id)});
  }));
  app.post('/api/invites/:code/join',route(async(req,res)=>{
    const serverId=await db.transaction(async tx=>{
      const i=await available(req.params.code,tx);
      if(await tx.queryOne('SELECT user_id FROM server_bans WHERE server_id=$1 AND user_id=$2',[i.server_id,req.user.id]))fail(403,'Você foi banido deste servidor');
      if(await tx.queryOne('SELECT user_id FROM server_members WHERE server_id=$1 AND user_id=$2',[i.server_id,req.user.id])) return i.server_id;
      const used=await tx.query('UPDATE server_invites SET uses=uses+1 WHERE code=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$2) AND (max_uses=0 OR uses<max_uses) RETURNING server_id',[i.code,new Date().toISOString()]);
      if(!used.length) fail(404,'Convite indisponível');
      const added=await tx.query('INSERT INTO server_members(server_id,user_id) VALUES($1,$2) ON CONFLICT(server_id,user_id) DO NOTHING RETURNING user_id',[i.server_id,req.user.id]);
      if(!added.length) await tx.query('UPDATE server_invites SET uses=uses-1 WHERE code=$1',[i.code]);
      return i.server_id;
    });
    const s=await serverView(req.user.id,serverId);
    for(const socket of io.sockets.sockets.values()) if(socket.data.user.id===req.user.id) {socket.join(`server_${serverId}`);for(const c of s.channels)socket.join(`channel_${c.id}`);socket.emit('server_created',s);}
    publishPresence();res.json(s);
  }));
  app.post('/api/invites/:code/share',route(async(req,res)=>{
    const target=req.body.userId,me=req.user.id;
    const m=await db.transaction(async tx=>{
      const i=await available(req.params.code,tx);
      if(!await tx.queryOne('SELECT user_id FROM server_members WHERE server_id=$1 AND user_id=$2',[i.server_id,me])) fail(403,'Servidor indisponível');
      if(await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[me,target]) || !await tx.queryOne("SELECT state FROM friendships WHERE ((user_low=$1 AND user_high=$2) OR (user_low=$2 AND user_high=$1)) AND state='accepted'",[me,target])) fail(403,'Escolha um amigo para compartilhar');
      const [a,b]=[me,target].sort();
      await tx.query('INSERT INTO dm_conversations(id,user_low,user_high) VALUES($1,$2,$3) ON CONFLICT(user_low,user_high) DO NOTHING',[crypto.randomUUID(),a,b]);
      const c=await tx.queryOne('SELECT id FROM dm_conversations WHERE user_low=$1 AND user_high=$2',[a,b]);
      for(const user of [me,target])await tx.query('INSERT INTO dm_participants(conversation_id,user_id,state,joined_at) VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,user_id) DO NOTHING',[c.id,user,'accepted',new Date().toISOString()]);
      const s=await tx.queryOne('SELECT name FROM servers WHERE id=$1',[i.server_id]);
      const m={id:crypto.randomUUID(),conversationId:c.id,content:`Convite para ${s.name}`,timestamp:new Date().toISOString(),sender:req.user,inviteCode:i.code};
      await tx.query('INSERT INTO dm_messages(id,conversation_id,sender_id,content,timestamp,invite_code) VALUES($1,$2,$3,$4,$5,$6)',[m.id,c.id,me,m.content,m.timestamp,i.code]);return m;
    });
    for(const id of [me,target]) {io.to(`user_${id}`).emit('dm_message',m);io.to(`user_${id}`).emit('social_update',{});}
    res.status(201).json({ok:true,conversationId:m.conversationId});
  }));
  for(const kind of ['channels','dms']) {
    const dm=kind==='dms',field=dm?'conversation_id':'channel_id';
    async function access(user,id,send=false) {
      if(dm) return conversationAccess(user,id,db,{send});
      const c=await channelAccess(user,id,'text');if(!c) fail(403,'Canal indisponível');return c;
    }
    function notify(c,event,data) {if(dm) for(const p of c.members) io.to(`user_${p.user_id}`).emit(`dm_${event}`,data);else io.to(`channel_${c.id}`).emit(`message_${event}`,data);}
    app.put(`/api/${kind}/:id/messages/:messageId`,route(async(req,res)=>{
      const c=await access(req.user.id,req.params.id,true),table=dm?c.messagesTable:'messages',content=req.body.content;
      if(typeof content!=='string' || !content.trim() || content.length>4000) fail(400,'Mensagem inválida (máximo 4000 caracteres)');
      if(dm)await validateAssetReferences(req.user.id,content);else {const checked=await accessibleChannel(req.user.id,c.id,'text','sendMessages');if(!checked)fail(403,'Você não pode editar mensagens neste canal');await validateMessageContent(req.user.id,content,checked);}
      const editedAt=new Date().toISOString();
      const rows=await db.query(`UPDATE ${table} SET content=$1,edited_at=$2 WHERE id=$3 AND ${field}=$4 AND sender_id=$5 AND deleted_at IS NULL AND ${dm?'invite_code IS NULL':'1=1'} RETURNING id`,[content,editedAt,req.params.messageId,req.params.id,req.user.id]);
      if(!rows.length) fail(403,'Você só pode editar suas próprias mensagens');
      const data={id:rows[0].id,channelId:dm?undefined:c.id,conversationId:dm?c.id:undefined,content,editedAt};notify(c,'updated',data);res.json(data);
    }));
    app.delete(`/api/${kind}/:id/messages/:messageId`,route(async(req,res)=>{
      const c=await access(req.user.id,req.params.id),table=dm?c.messagesTable:'messages',deletedAt=new Date().toISOString();
      const moderator=!dm && c.permissions?.manageMessages;
      const rows=await db.query(`UPDATE ${table} SET deleted_at=$1 WHERE id=$2 AND ${field}=$3 AND (sender_id=$4 OR $5=1) AND deleted_at IS NULL RETURNING id`,[deletedAt,req.params.messageId,req.params.id,req.user.id,moderator?1:0]);
      if(!rows.length) fail(403,'Você só pode excluir suas próprias mensagens');
      const data={id:rows[0].id,channelId:dm?undefined:c.id,conversationId:dm?c.id:undefined,deletedAt};notify(c,'deleted',data);res.json(data);
    }));
  }
}
