import crypto from 'node:crypto';
import db from './db.js';
import {hashToken,passwordHash,verifyTotp,equalHash} from './account-security.js';
import {accessibleChannel,serverMembership,parseJson} from './permissions.js';
import {privateVoiceAccess} from './private-calls.js';
import {userSettings,socialRelation,policyAllows} from './settings.js';

export const publicUser = u => ({ id:u.id, username:u.username, handle:u.login_name, discriminator:u.discriminator, avatar:u.avatar || '', banner:u.banner || '', bannerColor:u.banner_color, bio:u.bio || '', status:u.status, customStatus:u.status_expires && Date.parse(u.status_expires)<Date.now()?'':u.custom_status || '', pronouns:u.pronouns || '',statusEmoji:u.status_emoji || '',statusExpires:u.status_expires,createdAt:u.created_at,connections:parseJson(u.connections,[]),activity:u.activity || '',activityStarted:u.activity_started });
export async function visibleUser(viewer,u,tx=db){const user='customStatus' in u?{...u}:publicUser(u);if(viewer===user.id)return user;const settings=await userSettings(user.id,tx),relation=await socialRelation(viewer,user.id,tx),block=await tx.queryOne('SELECT user_id FROM user_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)',[viewer,user.id]);let result=user;if(block || !policyAllows(settings.profileVisibility,relation))result={id:user.id,username:user.username,handle:user.handle,discriminator:user.discriminator,avatar:'',status:user.status,customStatus:''};if(!settings.allowActivity || !policyAllows(settings.activityVisibility,relation))result={...result,activity:'',activityStarted:null};return result;}
export async function authenticate(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db.queryOne(`SELECT u.*,a.login_name,s.token_hash,s.expires_ms FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_accounts a ON a.user_id=u.id WHERE s.token_hash=$1 AND s.expires_ms>$2 AND u.account_state='active'`, [hashToken(token),Date.now()]);
  return row ? { user: publicUser(row), tokenHash:row.token_hash } : null;
}
export const route = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
export function fail(status,message) { const error=new Error(message); error.status=status; throw error; }
export async function requireAuth(req,res,next) {
  try {
    const auth = await authenticate(req.headers.authorization?.replace(/^Bearer /,''));
    if (!auth) return res.status(401).json({ error:'Sessão inválida ou expirada' });
    Object.assign(req,auth); res.set('Cache-Control','no-store'); next();
  } catch (e) { next(e); }
}
const attempts = new Map();
let activeHashes = 0;
function limit(req) {
  const key = req.ip;
  const now = Date.now();
  if (attempts.size > 5000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const v = attempts.get(key);
  if (!v || v.until < now) { attempts.set(key,{count:1,until:now+600000}); return; }
  if (++v.count > 30) fail(429,'Muitas tentativas. Aguarde alguns minutos.');
}
async function issue(userId,req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now()+7*86400000;
  await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_ms,id,created_at,device,last_seen) VALUES($1,$2,$3,$4,$5,$6,$5)',[hashToken(token),userId,expiresAt,crypto.randomUUID(),new Date().toISOString(),String(req.headers['user-agent'] || 'Dispositivo desconhecido').slice(0,200)]);
  return { token,expiresAt,user:publicUser(await db.queryOne('SELECT u.*,a.login_name FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.id=$1',[userId])) };
}
export function installAuth(app,io) {
  app.post('/api/auth/:action', route(async (req,res) => {
    if (!['register','login'].includes(req.params.action)) fail(404,'Rota desconhecida');
    limit(req);
    const handle = String(req.body.handle || '').trim().toLowerCase();
    const password = req.body.password;
    if (!/^[a-z0-9_.-]{3,32}$/.test(handle) || typeof password !== 'string' || password.length < 12 || password.length > 256) fail(400,'Usuário: 3–32 letras/números. Senha: 12–256 caracteres.');
    if (activeHashes >= 4) fail(429,'Servidor ocupado. Tente novamente.');
    activeHashes++;
    try {
      if (req.params.action === 'register') {
        const salt = crypto.randomBytes(32).toString('hex');
        const hash = await passwordHash(password,salt);
        const userId = crypto.randomUUID();
        await db.transaction(async tx => {
          if (await tx.queryOne('SELECT user_id FROM auth_accounts WHERE login_name=$1',[handle])) fail(409,'Nome de usuário indisponível');
          await tx.query('INSERT INTO users(id,username,discriminator,status) VALUES($1,$2,$3,$4)',[userId,String(req.body.username || handle).trim().slice(0,32) || handle,Math.floor(1000+Math.random()*9000),'online']);
          await tx.query('INSERT INTO auth_accounts(user_id,login_name,password_salt,password_hash) VALUES($1,$2,$3,$4)',[userId,handle,salt,hash]);
          await tx.query('INSERT INTO server_members(server_id,user_id) SELECT id,$1 FROM servers WHERE is_public=1 ON CONFLICT(server_id,user_id) DO NOTHING',[userId]);
        });
        return res.status(201).json(await issue(userId,req));
      }
      const account = await db.queryOne('SELECT * FROM auth_accounts WHERE login_name=$1',[handle]);
      const calculated = await passwordHash(password,account?.password_salt || '0'.repeat(64));
      if (!account || !crypto.timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(account.password_hash,'hex'))) fail(401,'Usuário ou senha incorretos');
      if(account.totp_secret){const step=verifyTotp(account.totp_secret,req.body.code,account.totp_last_step);if(step===null){const codes=parseJson(account.recovery_hash,[]),hash=hashToken(String(req.body.code || ''));if(!codes.some(c=>equalHash(c,hash)))fail(401,'Código de autenticação em dois fatores necessário ou inválido');const consumed=await db.query('UPDATE auth_accounts SET recovery_hash=$1 WHERE user_id=$2 AND recovery_hash=$3 RETURNING user_id',[JSON.stringify(codes.filter(c=>!equalHash(c,hash))),account.user_id,account.recovery_hash]);if(!consumed.length)fail(401,'Código já utilizado');}else{const consumed=await db.query('UPDATE auth_accounts SET totp_last_step=$1 WHERE user_id=$2 AND (totp_last_step IS NULL OR totp_last_step<$1) RETURNING user_id',[step,account.user_id]);if(!consumed.length)fail(401,'Código já utilizado');}}
      const user=await db.queryOne('SELECT account_state FROM users WHERE id=$1',[account.user_id]);if(user.account_state==='deleted')fail(401,'Conta excluída');if(user.account_state==='disabled'){if(req.body.reactivate!==true)fail(409,'Conta desativada. Marque Reativar conta para entrar.');await db.query("UPDATE users SET account_state='active' WHERE id=$1",[account.user_id]);}
      res.json(await issue(account.user_id,req));
    } finally { activeHashes--; }
  }));
  app.get('/api/auth/me',requireAuth,(req,res)=>res.json(req.user));
  app.delete('/api/auth/session',requireAuth,route(async (req,res)=>{
    await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[req.tokenHash]);
    for (const socket of io.sockets.sockets.values()) if (socket.data.tokenHash===req.tokenHash) socket.disconnect(true);
    res.sendStatus(204);
  }));
  io.use(async (socket,next)=> {
    try { const auth=await authenticate(socket.handshake.auth?.token); if (!auth) return next(new Error('UNAUTHORIZED')); Object.assign(socket.data,auth); next(); }
    catch { next(new Error('UNAUTHORIZED')); }
  });
}
export async function member(userId,serverId) {
  return !!await serverMembership(userId,serverId);
}
export async function channelAccess(userId,channelId,type,permission='viewChannel') {
  if(typeof channelId==='string' && channelId.startsWith('dm:'))return type && type!=='voice'?null:privateVoiceAccess(userId,channelId);
  return accessibleChannel(userId,channelId,type,permission);
}
export async function owner(userId,serverId) {
  if (!await db.queryOne('SELECT id FROM servers WHERE id=$1 AND owner_id=$2',[serverId,userId])) fail(403,'Somente o dono do servidor pode alterar esta configuração');
}
