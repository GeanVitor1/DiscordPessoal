import crypto from 'node:crypto';
import { promisify } from 'node:util';
import db from './db.js';

const scrypt = promisify(crypto.scrypt);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const passwordHash = async (password, salt) => (await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })).toString('hex');
export const publicUser = u => ({ id:u.id, username:u.username, handle:u.login_name, discriminator:u.discriminator, avatar:u.avatar || '', banner:u.banner || '', bannerColor:u.banner_color, bio:u.bio || '', status:u.status, customStatus:u.custom_status || '' });
export async function authenticate(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db.queryOne(`SELECT u.*,a.login_name,s.token_hash,s.expires_ms FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_accounts a ON a.user_id=u.id WHERE s.token_hash=$1 AND s.expires_ms>$2`, [hashToken(token),Date.now()]);
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
async function issue(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now()+7*86400000;
  await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_ms) VALUES($1,$2,$3)',[hashToken(token),userId,expiresAt]);
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
        return res.status(201).json(await issue(userId));
      }
      const account = await db.queryOne('SELECT * FROM auth_accounts WHERE login_name=$1',[handle]);
      const calculated = await passwordHash(password,account?.password_salt || '0'.repeat(64));
      if (!account || !crypto.timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(account.password_hash,'hex'))) fail(401,'Usuário ou senha incorretos');
      res.json(await issue(account.user_id));
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
  return !!await db.queryOne('SELECT user_id FROM server_members WHERE user_id=$1 AND server_id=$2',[userId,serverId]);
}
export async function channelAccess(userId,channelId,type) {
  return await db.queryOne(`SELECT c.* FROM channels c JOIN server_members m ON m.server_id=c.server_id WHERE c.id=$1 AND m.user_id=$2 ${type ? 'AND c.type=$3' : ''}`,[channelId,userId,...(type?[type]:[])]);
}
export async function owner(userId,serverId) {
  if (!await db.queryOne('SELECT id FROM servers WHERE id=$1 AND owner_id=$2',[serverId,userId])) fail(403,'Somente o dono do servidor pode alterar esta configuração');
}
