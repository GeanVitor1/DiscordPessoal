import db from './db.js';
import {route,fail,publicUser,visibleUser,member} from './auth.js';
import {friendshipAllowed} from './settings.js';
import {installConversations} from './conversations.js';
const pair=(a,b)=>[a,b].sort();
export async function blocked(a,b,tx=db){return !!await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[a,b]);}
export function installSocial(app,io,activeUsers,onBlock=()=>{},voiceRooms={},onConversationRemoved=()=>{}) {
  const notify=(ids,event,data)=>{for(const id of new Set(ids))io.to(`user_${id}`).emit(event,data);};
  const changed=(a,b)=>notify([a,b],'social_update',{});
  app.get('/api/friends',route(async(req,res)=>{
    const me=req.user.id,links=await db.query('SELECT * FROM friendships WHERE user_low=$1 OR user_high=$1',[me]),blocks=await db.query('SELECT blocked_id FROM user_blocks WHERE user_id=$1',[me]),rows=[];
    for(const f of links){const other=f.user_low===me?f.user_high:f.user_low;if(await blocked(me,other))continue;const u=await db.queryOne("SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1 AND u.account_state<>'deleted'",[other]);if(u)rows.push({...await visibleUser(me,u),status:Object.values(activeUsers).find(x=>x.id===other)?.status || 'offline',state:f.state,direction:f.requested_by===me?'outgoing':'incoming'});}
    for(const b of blocks){const u=await db.queryOne('SELECT u.*,a.login_name FROM users u LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[b.blocked_id]);if(u)rows.push({...await visibleUser(me,u),status:'offline',state:'blocked'});}res.json(rows);
  }));
  app.post('/api/friends/requests',route(async(req,res)=>{
    const target=await db.queryOne("SELECT a.user_id FROM auth_accounts a JOIN users u ON u.id=a.user_id WHERE a.login_name=$1 AND u.account_state='active'",[String(req.body.handle || '').trim().toLowerCase()]);if(!target || target.user_id===req.user.id)fail(400,'Usuário não encontrado ou solicitação inválida');
    const[a,b]=pair(req.user.id,target.user_id);await db.transaction(async tx=>{if(await blocked(a,b,tx) || !await friendshipAllowed(req.user.id,target.user_id,tx))fail(403,'Este usuário não permite a solicitação');if(await tx.queryOne('SELECT state FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]))fail(409,'Já existe uma amizade ou solicitação');await tx.query('INSERT INTO friendships(user_low,user_high,requested_by,state) VALUES($1,$2,$3,$4)',[a,b,req.user.id,'pending']);});changed(a,b);notify([target.user_id],'friend_request',{user:await visibleUser(target.user_id,req.user)});res.sendStatus(201);
  }));
  app.put('/api/friends/:userId/accept',route(async(req,res)=>{const[a,b]=pair(req.user.id,req.params.userId),rows=await db.query("UPDATE friendships SET state='accepted' WHERE user_low=$1 AND user_high=$2 AND state='pending' AND requested_by<>$3 RETURNING user_low",[a,b,req.user.id]);if(!rows.length)fail(409,'Solicitação indisponível');changed(a,b);notify([req.params.userId],'friend_accepted',{user:await visibleUser(req.params.userId,req.user)});res.sendStatus(204);}));
  app.delete('/api/friends/:userId',route(async(req,res)=>{const[a,b]=pair(req.user.id,req.params.userId);await db.query('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]);changed(a,b);res.sendStatus(204);}));
  app.put('/api/blocks/:userId',route(async(req,res)=>{
    const other=req.params.userId,me=req.user.id;if(other===me || !await db.queryOne('SELECT id FROM users WHERE id=$1',[other]))fail(400,'Usuário inválido');const[a,b]=pair(me,other);
    await db.transaction(async tx=>{await tx.query('INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT(user_id,blocked_id) DO NOTHING',[me,other]);await tx.query('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[a,b]);});onBlock(me,other);
    for(const s of io.sockets.sockets.values())if([me,other].includes(s.data.user?.id))s.emit('peer_blocked',{userId:s.data.user.id===me?other:me});changed(a,b);res.sendStatus(204);
  }));
  app.delete('/api/blocks/:userId',route(async(req,res)=>{await db.query('DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2',[req.user.id,req.params.userId]);changed(req.user.id,req.params.userId);res.sendStatus(204);}));
  const conversations=installConversations(app,io,notify,changed,onBlock,onConversationRemoved);
  const attach=socket=>{
    conversations.attach(socket);
    socket.on('call_invite',async(data={},ack=()=>{})=>{try{const me=socket.data.user.id,[a,b]=pair(me,data.userId);if(await blocked(a,b) || !await db.queryOne("SELECT state FROM friendships WHERE user_low=$1 AND user_high=$2 AND state='accepted'",[a,b]))fail(403,'Convite indisponível');const c=await db.queryOne("SELECT * FROM channels WHERE id=$1 AND type='voice' AND deleted_at IS NULL",[data.channelId]);if(!voiceRooms[data.channelId]?.some(p=>p.socketId===socket.id))fail(403,'Entre na chamada antes de convidar');if(!c || !await member(me,c.server_id) || !await member(data.userId,c.server_id))fail(403,'Ambos precisam participar do servidor');notify([data.userId],'call_invitation',{user:socket.data.user,channel:c});ack({ok:true});}catch(e){ack({error:e.status?e.message:'Convite indisponível'});}});
  };
  return {attach};
}
