import crypto from 'node:crypto';
import db from './db.js';
import { route,fail,publicUser,member } from './auth.js';

const pair = (a,b) => [a,b].sort();
export async function blocked(a,b) {
  return !!await db.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[a,b]);
}
async function conversation(user,id) {
  const c=await db.queryOne('SELECT * FROM dm_conversations WHERE id=$1 AND (user_low=$2 OR user_high=$2)',[id,user]);
  if (!c) fail(403,'Conversa privada indisponível');
  return c;
}
export function installSocial(app,io,activeUsers,onBlock=()=>{},voiceRooms={}) {
  const notify = (ids,event,data) => { for(const id of new Set(ids)) io.to(`user_${id}`).emit(event,data); };
  const changed = (a,b) => notify([a,b],'social_update',{});
  app.get('/api/friends',route(async(req,res)=>{
    const me=req.user.id;
    const links=await db.query('SELECT * FROM friendships WHERE user_low=$1 OR user_high=$1',[me]);
    const blocks=await db.query('SELECT blocked_id FROM user_blocks WHERE user_id=$1',[me]);
    const rows=[];
    for(const f of links) {
      const other=f.user_low===me?f.user_high:f.user_low;
      if (await blocked(me,other)) continue;
      const u=await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[other]);
      if (u) rows.push({ ...publicUser(u),status:Object.values(activeUsers).find(x=>x.id===other)?.status || 'offline',state:f.state,direction:f.requested_by===me?'outgoing':'incoming' });
    }
    for(const b of blocks) {
      const u=await db.queryOne('SELECT u.*,a.login_name FROM users u LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[b.blocked_id]);
      if(u) rows.push({...publicUser(u),status:'offline',state:'blocked'});
    }
    res.json(rows);
  }));
  app.post('/api/friends/requests',route(async(req,res)=>{
    const target=await db.queryOne('SELECT user_id FROM auth_accounts WHERE login_name=$1',[String(req.body.handle || '').trim().toLowerCase()]);
    if(!target || target.user_id===req.user.id) fail(400,'Usuário não encontrado ou solicitação inválida');
    const [a,b]=pair(req.user.id,target.user_id);
    await db.transaction(async tx=>{
      if(await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[a,b])) fail(403,'Solicitação indisponível');
      if(await tx.queryOne('SELECT state FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b])) fail(409,'Já existe uma amizade ou solicitação');
      await tx.query('INSERT INTO friendships(user_low,user_high,requested_by,state) VALUES($1,$2,$3,$4)',[a,b,req.user.id,'pending']);
    });
    changed(a,b); notify([target.user_id],'friend_request',{user:req.user}); res.sendStatus(201);
  }));
  app.put('/api/friends/:userId/accept',route(async(req,res)=>{
    const [a,b]=pair(req.user.id,req.params.userId);
    const rows=await db.query("UPDATE friendships SET state='accepted' WHERE user_low=$1 AND user_high=$2 AND state='pending' AND requested_by<>$3 RETURNING user_low",[a,b,req.user.id]);
    if(!rows.length) fail(409,'Solicitação indisponível'); changed(a,b);res.sendStatus(204);
  }));
  app.delete('/api/friends/:userId',route(async(req,res)=>{
    const [a,b]=pair(req.user.id,req.params.userId);
    await db.query('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]); changed(a,b);res.sendStatus(204);
  }));
  app.put('/api/blocks/:userId',route(async(req,res)=>{
    const other=req.params.userId, me=req.user.id;
    if(other===me || !await db.queryOne('SELECT id FROM users WHERE id=$1',[other])) fail(400,'Usuário inválido');
    const [a,b]=pair(me,other);
    await db.transaction(async tx=>{
      await tx.query('INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT(user_id,blocked_id) DO NOTHING',[me,other]);
      await tx.query('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]);
    });
    onBlock(me,other);
    // Terminate any consent between the pair; blocking never preserves assistance.
    for (const s of io.sockets.sockets.values()) if([me,other].includes(s.data.user?.id)) s.emit('peer_blocked',{userId:s.data.user.id===me?other:me});
    changed(a,b); res.sendStatus(204);
  }));
  app.delete('/api/blocks/:userId',route(async(req,res)=>{
    await db.query('DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2',[req.user.id,req.params.userId]);changed(req.user.id,req.params.userId);res.sendStatus(204);
  }));
  app.get('/api/dms',route(async(req,res)=>{
    const me=req.user.id;
    const rows=await db.query('SELECT * FROM dm_conversations WHERE user_low=$1 OR user_high=$1',[me]);
    const output=[];
    for(const c of rows) {
      const other=c.user_low===me?c.user_high:c.user_low;
      const u=await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[other]);
      const unread=await db.queryOne(`SELECT count(*) AS count FROM dm_messages m WHERE m.conversation_id=$1 AND m.sender_id<>$2 AND m.timestamp>COALESCE((SELECT read_at FROM dm_reads WHERE conversation_id=$1 AND user_id=$2),'1970-01-01')`,[c.id,me]);
      output.push({id:c.id,user:publicUser(u),blocked:await blocked(me,other),unread:Number(unread.count),lastMessage:await db.queryOne('SELECT content,timestamp FROM dm_messages WHERE conversation_id=$1 ORDER BY timestamp DESC,id DESC LIMIT 1',[c.id])});
    }
    res.json(output.sort((a,b)=>String(b.lastMessage?.timestamp||'').localeCompare(String(a.lastMessage?.timestamp||''))));
  }));
  app.post('/api/dms',route(async(req,res)=>{
    const [a,b]=pair(req.user.id,String(req.body.userId || ''));
    const c=await db.transaction(async tx=>{
      if(await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[a,b])) fail(403,'Conversa bloqueada');
      const existing=await tx.queryOne('SELECT * FROM dm_conversations WHERE user_low=$1 AND user_high=$2',[a,b]);
      if(existing) return existing;
      if(!await tx.queryOne("SELECT state FROM friendships WHERE user_low=$1 AND user_high=$2 AND state='accepted'",[a,b])) fail(403,'Adicione este usuário como amigo antes de abrir uma conversa');
      const id=crypto.randomUUID(); await tx.query('INSERT INTO dm_conversations(id,user_low,user_high) VALUES($1,$2,$3) ON CONFLICT(user_low,user_high) DO NOTHING',[id,a,b]);
      return tx.queryOne('SELECT * FROM dm_conversations WHERE user_low=$1 AND user_high=$2',[a,b]);
    }); changed(a,b);res.json({id:c.id});
  }));
  app.get('/api/dms/:id/messages',route(async(req,res)=>{
    await conversation(req.user.id,req.params.id);
    const rows=await db.query(`SELECT m.*,u.username,u.avatar FROM (SELECT * FROM dm_messages WHERE conversation_id=$1 ORDER BY timestamp DESC,id DESC LIMIT 100) m JOIN users u ON u.id=m.sender_id ORDER BY m.timestamp ASC,m.id ASC`,[req.params.id]);
    res.json(rows.map(m=>({id:m.id,conversationId:m.conversation_id,content:m.content,timestamp:m.timestamp,sender:{id:m.sender_id,username:m.username,avatar:m.avatar}})));
  }));
  app.put('/api/dms/:id/read',route(async(req,res)=>{
    await conversation(req.user.id,req.params.id);
    await db.query('INSERT INTO dm_reads(conversation_id,user_id,read_at) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=excluded.read_at',[req.params.id,req.user.id,new Date().toISOString()]);
    notify([req.user.id],'social_update',{});res.sendStatus(204);
  }));
  function attach(socket) {
    socket.on('dm_send',async(data={},ack=()=>{})=>{
      try {
        if(typeof data.content!=='string' || !data.content.trim() || data.content.length>4000) fail(400,'Mensagem inválida (máximo 4000 caracteres)');
        const me=socket.data.user.id,c=await conversation(me,data.conversationId);
        // Serialize with friendship/block operations so a blocked user cannot win a send race.
        const m=await db.transaction(async tx=>{
          if(await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[c.user_low,c.user_high])) fail(403,'Conversa bloqueada');
          const m={id:crypto.randomUUID(),conversationId:c.id,sender:socket.data.user,content:data.content,timestamp:new Date().toISOString()};
          await tx.query('INSERT INTO dm_messages(id,conversation_id,sender_id,content,timestamp) VALUES($1,$2,$3,$4,$5)',[m.id,c.id,me,m.content,m.timestamp]);return m;
        });
        notify([c.user_low,c.user_high],'dm_message',m);changed(c.user_low,c.user_high);ack({ok:true,id:m.id});
      }catch(e){ack({error:e.status?e.message:'Não foi possível enviar a mensagem'});}
    });
    socket.on('call_invite',async(data={},ack=()=>{})=>{
      try {
        const me=socket.data.user.id,[a,b]=pair(me,data.userId);
        if(await blocked(a,b) || !await db.queryOne("SELECT state FROM friendships WHERE user_low=$1 AND user_high=$2 AND state='accepted'",[a,b])) fail(403,'Convite indisponível');
        const c=await db.queryOne("SELECT * FROM channels WHERE id=$1 AND type='voice'",[data.channelId]);
        if(!voiceRooms[data.channelId]?.some(p=>p.socketId===socket.id)) fail(403,'Entre na chamada antes de convidar');
        if(!c || !await member(me,c.server_id) || !await member(data.userId,c.server_id)) fail(403,'Ambos precisam participar do servidor');
        notify([data.userId],'call_invitation',{user:socket.data.user,channel:c});ack({ok:true});
      }catch(e){ack({error:e.status?e.message:'Convite indisponível'});}
    });
  }
  return {attach};
}
