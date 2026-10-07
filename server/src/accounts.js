import crypto from 'node:crypto';
import db from './db.js';
import {route,fail,requireAuth,publicUser} from './auth.js';
import {hashToken,passwordHash,checkPassword,validPassword,base32,verifyTotp,equalHash,mailConfigured,sendAccountMail} from './account-security.js';
import {normalizeSettings,userSettings,socialRelation,policyAllows} from './settings.js';
import {parseJson} from './permissions.js';
import {scopedProfile} from './profiles.js';

const attempts=new Map();
function throttle(req) {const key=`${req.ip}:${req.user?.id || 'public'}`,now=Date.now(),old=attempts.get(key);if(!old || old.until<now)attempts.set(key,{count:1,until:now+600000});else if(++old.count>20)fail(429,'Muitas tentativas; aguarde alguns minutos');if(attempts.size>10000)for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);}
async function sensitive(req,tx=db) {
  throttle(req);const a=await tx.queryOne('SELECT * FROM auth_accounts WHERE user_id=$1',[req.user.id]);
  if(!await checkPassword(a,req.body.password))fail(401,'Senha atual incorreta');
  if(a.totp_secret){const step=verifyTotp(a.totp_secret,req.body.code,a.totp_last_step);if(step===null)fail(401,'Código de autenticação inválido');const rows=await tx.query('UPDATE auth_accounts SET totp_last_step=$1 WHERE user_id=$2 AND (totp_last_step IS NULL OR totp_last_step<$1) RETURNING user_id',[step,req.user.id]);if(!rows.length)fail(401,'Código já utilizado');}
  return a;
}
export function installAccounts(app,io,activeUsers,publishPresence) {
  const disconnect=id=>{for(const s of io.sockets.sockets.values())if(s.data.user.id===id){s.emit('session_expired');s.disconnect(true);}};
  // Public endpoints precede the application's /api authentication middleware.
  app.get('/api/account/capabilities',(_req,res)=>res.json({mail:mailConfigured(),twoFactor:true}));
  app.post('/api/account/recovery',route(async(req,res)=>{
    throttle(req);if(!mailConfigured())fail(503,'O envio de e-mails ainda precisa ser configurado no servidor');
    const email=String(req.body.email || '').trim().toLowerCase(),account=await db.queryOne("SELECT a.* FROM auth_accounts a JOIN users u ON u.id=a.user_id WHERE a.email=$1 AND a.email_verified=1 AND u.account_state<>'deleted'",[email]);
    if(account){const token=crypto.randomBytes(32).toString('base64url');await db.query('INSERT INTO account_tokens(token_hash,user_id,purpose,expires_ms) VALUES($1,$2,$3,$4)',[hashToken(token),account.user_id,'reset',Date.now()+1800000]);try{await sendAccountMail(email,token,'reset');}catch{await db.query('DELETE FROM account_tokens WHERE token_hash=$1',[hashToken(token)]);console.error('[Account mail] Recovery delivery failed');}}
    res.json({ok:true,message:'Se o e-mail estiver confirmado, você receberá as instruções.'});
  }));
  app.post('/api/account/reset-password',route(async(req,res)=>{
    throttle(req);if(!validPassword(req.body.newPassword))fail(400,'A senha deve ter 12–256 caracteres');
    if(typeof req.body.token!=='string' || req.body.token.length>200)fail(400,'Código inválido');
    const salt=crypto.randomBytes(32).toString('hex'),hash=await passwordHash(req.body.newPassword,salt);
    const user=await db.transaction(async tx=>{const token=await tx.queryOne("SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_ms>$2",[hashToken(req.body.token),Date.now()]);if(!token)fail(400,'Código inválido ou expirado');const used=await tx.query('DELETE FROM account_tokens WHERE token_hash=$1 RETURNING user_id',[token.token_hash]);if(!used.length)fail(400,'Código já utilizado');await tx.query('UPDATE auth_accounts SET password_salt=$1,password_hash=$2 WHERE user_id=$3',[salt,hash,token.user_id]);await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[token.user_id]);return token.user_id;});disconnect(user);res.sendStatus(204);
  }));
  app.post('/api/account/verify-email',route(async(req,res)=>{
    throttle(req);if(typeof req.body.token!=='string' || req.body.token.length>200)fail(400,'Código inválido');
    await db.transaction(async tx=>{const token=await tx.queryOne("SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose='email' AND expires_ms>$2",[hashToken(req.body.token),Date.now()]);if(!token)fail(400,'Código inválido ou expirado');const used=await tx.query('DELETE FROM account_tokens WHERE token_hash=$1 RETURNING user_id',[token.token_hash]);if(!used.length)fail(400,'Código já utilizado');const exists=await tx.queryOne('SELECT user_id FROM auth_accounts WHERE email=$1 AND user_id<>$2',[token.value,token.user_id]);if(exists)fail(409,'E-mail indisponível');await tx.query('UPDATE auth_accounts SET email=$1,email_verified=1 WHERE user_id=$2',[token.value,token.user_id]);});res.sendStatus(204);
  }));
  app.use('/api/account',requireAuth);
  app.get('/api/account',route(async(req,res)=>{const a=await db.queryOne('SELECT email,email_verified,totp_secret FROM auth_accounts WHERE user_id=$1',[req.user.id]);res.json({email:a.email,emailVerified:!!a.email_verified,twoFactor:!!a.totp_secret,mail:mailConfigured()});}));
  app.put('/api/account/password',route(async(req,res)=>{await sensitive(req);if(!validPassword(req.body.newPassword))fail(400,'A senha deve ter 12–256 caracteres');const salt=crypto.randomBytes(32).toString('hex'),hash=await passwordHash(req.body.newPassword,salt);await db.transaction(async tx=>{await tx.query('UPDATE auth_accounts SET password_salt=$1,password_hash=$2 WHERE user_id=$3',[salt,hash,req.user.id]);await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[req.user.id]);});disconnect(req.user.id);res.sendStatus(204);}));
  app.put('/api/account/handle',route(async(req,res)=>{await sensitive(req);const handle=String(req.body.handle || '').trim().toLowerCase();if(!/^[a-z0-9_.-]{3,32}$/.test(handle))fail(400,'Usuário inválido');if(await db.queryOne('SELECT user_id FROM auth_accounts WHERE login_name=$1 AND user_id<>$2',[handle,req.user.id]))fail(409,'Nome de usuário indisponível');await db.query('UPDATE auth_accounts SET login_name=$1 WHERE user_id=$2',[handle,req.user.id]);res.json({handle});}));
  app.put('/api/account/email',route(async(req,res)=>{await sensitive(req);const email=String(req.body.email || '').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)fail(400,'E-mail inválido');if(await db.queryOne('SELECT user_id FROM auth_accounts WHERE email=$1 AND user_id<>$2',[email,req.user.id]))fail(409,'E-mail indisponível');const token=crypto.randomBytes(32).toString('base64url');await db.query('INSERT INTO account_tokens(token_hash,user_id,purpose,value,expires_ms) VALUES($1,$2,$3,$4,$5)',[hashToken(token),req.user.id,'email',email,Date.now()+1800000]);try{await sendAccountMail(email,token,'email');}catch(e){await db.query('DELETE FROM account_tokens WHERE token_hash=$1',[hashToken(token)]);fail(503,'Não foi possível enviar a confirmação. Verifique a configuração SMTP do servidor.');}res.json({ok:true,message:'Confirme o novo endereço usando o e-mail enviado.'});}));
  app.get('/api/account/sessions',route(async(req,res)=>{const sessions=await db.query('SELECT id,device,created_at,last_seen,expires_ms,token_hash FROM auth_sessions WHERE user_id=$1 AND expires_ms>$2 ORDER BY expires_ms DESC',[req.user.id,Date.now()]);res.json(sessions.map(s=>({id:s.id || `legacy:${s.expires_ms}`,device:s.device || 'Sessão anterior',createdAt:s.created_at,lastSeen:s.last_seen,expiresAt:Number(s.expires_ms),current:s.token_hash===req.tokenHash})));}));
  app.delete('/api/account/sessions/:id',route(async(req,res)=>{const tokens=await db.query('DELETE FROM auth_sessions WHERE user_id=$1 AND id=$2 RETURNING token_hash',[req.user.id,req.params.id]);for(const s of io.sockets.sockets.values())if(tokens.some(t=>t.token_hash===s.data.tokenHash))s.disconnect(true);res.sendStatus(204);}));
  app.delete('/api/account/other-sessions',route(async(req,res)=>{await db.query('DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2',[req.user.id,req.tokenHash]);for(const s of io.sockets.sockets.values())if(s.data.user.id===req.user.id && s.data.tokenHash!==req.tokenHash)s.disconnect(true);res.sendStatus(204);}));
  app.post('/api/account/two-factor/setup',route(async(req,res)=>{await sensitive(req);const secret=base32(crypto.randomBytes(20));await db.query('UPDATE auth_accounts SET totp_pending=$1 WHERE user_id=$2',[secret,req.user.id]);res.json({secret,uri:`otpauth://totp/MeuApp:${encodeURIComponent(req.user.handle)}?secret=${secret}&issuer=MeuApp`});}));
  app.post('/api/account/two-factor/enable',route(async(req,res)=>{throttle(req);const codes=Array.from({length:10},()=>crypto.randomBytes(12).toString('hex'));await db.transaction(async tx=>{const a=await tx.queryOne('SELECT totp_pending FROM auth_accounts WHERE user_id=$1',[req.user.id]);const step=a?.totp_pending?verifyTotp(a.totp_pending,req.body.code):null;if(step===null)fail(400,'Código inválido; escaneie a configuração e tente novamente');await tx.query('UPDATE auth_accounts SET totp_secret=totp_pending,totp_pending=NULL,totp_last_step=$1,recovery_hash=$2 WHERE user_id=$3',[step,JSON.stringify(codes.map(hashToken)),req.user.id]);});res.json({recoveryCodes:codes});}));
  app.delete('/api/account/two-factor',route(async(req,res)=>{await sensitive(req);await db.query('UPDATE auth_accounts SET totp_secret=NULL,totp_pending=NULL,totp_last_step=NULL,recovery_hash=NULL WHERE user_id=$1',[req.user.id]);res.sendStatus(204);}));
  for(const state of ['disabled','deleted'])app.post(`/api/account/${state==='disabled'?'disable':'delete'}`,route(async(req,res)=>{await sensitive(req);if(await db.queryOne('SELECT id FROM servers WHERE owner_id=$1 AND deleted_at IS NULL',[req.user.id]))fail(409,'Transfira ou exclua seus servidores antes de desativar a conta');await db.transaction(async tx=>{await tx.query("UPDATE users SET account_state=$1,status='offline' WHERE id=$2",[state,req.user.id]);await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[req.user.id]);});disconnect(req.user.id);res.sendStatus(204);}));
  app.get('/api/settings',requireAuth,route(async(req,res)=>res.json(await userSettings(req.user.id))));
  app.put('/api/settings',requireAuth,route(async(req,res)=>{const value=normalizeSettings(req.body);await db.query('INSERT INTO user_settings(user_id,value) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET value=$2',[req.user.id,JSON.stringify(value)]);res.json(value);}));
  app.put('/api/profile/details',requireAuth,route(async(req,res)=>{
    const b=req.body;for(const key of ['pronouns','statusEmoji','activity'])if(b[key]!=null && (typeof b[key]!=='string' || b[key].length>128))fail(400,'Perfil inválido');
    if(b.connections && (!Array.isArray(b.connections) || b.connections.length>20 || b.connections.some(c=>typeof c.name!=='string' || c.name.length>80 || !/^https:\/\//.test(c.url) || c.url.length>2000)))fail(400,'Contas conectadas inválidas');
    if(b.statusExpires && !Number.isFinite(Date.parse(b.statusExpires)))fail(400,'Data de status inválida');
    if(b.connections)for(const c of b.connections){let url;try{url=new URL(c.url);}catch{fail(400,'Link inválido');}if(url.protocol!=='https:' || url.username || url.password)fail(400,'Link inválido');}
    const old=await db.queryOne('SELECT * FROM users WHERE id=$1',[req.user.id]);
    const expiry=Object.hasOwn(b,'statusExpires')?(b.statusExpires?new Date(b.statusExpires).toISOString():null):old.status_expires;
    await db.query('UPDATE users SET pronouns=$1,status_emoji=$2,status_expires=$3,connections=$4,activity=$5 WHERE id=$6',[b.pronouns??old.pronouns,b.statusEmoji??old.status_emoji,expiry,b.connections?JSON.stringify(b.connections):old.connections,b.activity??old.activity,req.user.id]);
    const user=publicUser(await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[req.user.id]));for(const s of io.sockets.sockets.values())if(s.data.user.id===req.user.id){s.data.user=user;activeUsers[s.id]={...user,socketId:s.id};}publishPresence();res.json(user);
  }));
  app.get('/api/users/:id/profile',requireAuth,route(async(req,res)=>{
    const id=req.params.id,relation=await socialRelation(req.user.id,id),settings=await userSettings(id);
    if(id!==req.user.id && (!policyAllows(settings.profileVisibility,relation) || await db.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[req.user.id,id])))fail(403,'Perfil privado');
    const u=await db.queryOne("SELECT u.*,a.login_name FROM users u LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1 AND u.account_state='active'",[id]);if(!u)fail(404,'Perfil indisponível');
    const friends=await db.query("SELECT user_low,user_high FROM friendships WHERE (user_low=$1 OR user_high=$1) AND state='accepted'",[id]),mutual=[];
    for(const f of friends){const other=f.user_low===id?f.user_high:f.user_low;if((await socialRelation(req.user.id,other)).friend){const user=await db.queryOne('SELECT id,username,avatar FROM users WHERE id=$1',[other]);if(user)mutual.push(user);}}
    const servers=[];for(const serverId of relation.shared){const s=await db.queryOne('SELECT id,name,icon FROM servers WHERE id=$1',[serverId]);if(s)servers.push(s);}
    const profile=publicUser(u);profile.status=Object.values(activeUsers).find(p=>p.id===id)?.status || 'offline';if(!settings.allowActivity || id!==req.user.id && !policyAllows(settings.activityVisibility,relation))profile.activity='';let serverProfile={};if(req.query.serverId){if(!relation.shared.includes(req.query.serverId) && id!==req.user.id)fail(403,'Perfil do servidor indisponível');serverProfile=await scopedProfile(id,req.query.serverId);}
    res.json({...profile,serverProfile,mutualFriends:mutual,mutualServers:servers,connections:parseJson(u.connections,[])});
  }));
}
