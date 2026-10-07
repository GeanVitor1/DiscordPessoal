import db from './db.js';
import crypto from 'node:crypto';

export const PERMISSIONS = ['administrator','manageServer','manageChannels','manageRoles','kickMembers','banMembers','manageNicknames','changeNickname','createInvite','viewChannel','sendMessages','readHistory','manageMessages','pinMessages','attachFiles','embedLinks','addReactions','useGifs','useExternalEmoji','mentionUsers','mentionEveryone','useCommands','createThreads','manageThreads','connect','speak','video','stream','muteMembers','deafenMembers','moveMembers','manageAssets','manageEvents','viewAudit','useSoundboard'];
export const CHANNEL_PERMISSIONS = ['createInvite','viewChannel','sendMessages','readHistory','manageMessages','pinMessages','attachFiles','embedLinks','addReactions','useGifs','useExternalEmoji','mentionUsers','mentionEveryone','useCommands','createThreads','manageThreads','connect','speak','video','stream','muteMembers','deafenMembers','moveMembers','useSoundboard'];
export const DEFAULT_PERMISSIONS = Object.fromEntries(['viewChannel','sendMessages','readHistory','attachFiles','embedLinks','addReactions','useGifs','useExternalEmoji','mentionUsers','useCommands','createThreads','connect','speak','video','stream','createInvite','useSoundboard','changeNickname'].map(k=>[k,true]));
export const parseJson = (value, fallback={}) => {try{return JSON.parse(value) ?? fallback;}catch{return fallback;}};
export function deny(message='Sem permissão para esta ação') {const error=new Error(message);error.status=403;throw error;}
export async function serverMembership(userId,serverId,tx=db) {
  return tx.queryOne('SELECT m.*,s.owner_id FROM server_members m JOIN servers s ON s.id=m.server_id WHERE m.user_id=$1 AND m.server_id=$2 AND s.deleted_at IS NULL',[userId,serverId]);
}
export async function rolesFor(userId,serverId,tx=db) {
  return tx.query('SELECT DISTINCT r.* FROM roles r LEFT JOIN member_roles mr ON mr.role_id=r.id AND mr.server_id=r.server_id AND mr.user_id=$1 WHERE r.server_id=$2 AND (r.is_default=1 OR mr.user_id IS NOT NULL) ORDER BY r.position',[userId,serverId]);
}
export async function permissionsFor(userId,serverId,channel=null,tx=db) {
  const m=await serverMembership(userId,serverId,tx);if(!m)return {};
  if(m.owner_id===userId)return Object.fromEntries(PERMISSIONS.map(k=>[k,true]));
  const roles=await rolesFor(userId,serverId,tx),result={...DEFAULT_PERMISSIONS};
  for(const r of roles) Object.assign(result,Object.fromEntries(Object.entries(parseJson(r.permissions)).filter(([k,v])=>PERMISSIONS.includes(k) && typeof v==='boolean' && (r.is_default || v))));
  if(result.administrator)return Object.fromEntries(PERMISSIONS.map(k=>[k,true]));
  if(channel) {
    const scope=channel.permission_sync && channel.category_id ? ['category',channel.category_id] : ['channel',channel.id];
    const overrides=await tx.query('SELECT * FROM permission_overrides WHERE scope_kind=$1 AND scope_id=$2',scope);
    const apply=rows=>{for(const decision of [0,1]) for(const row of rows)if(row.decision===decision && CHANNEL_PERMISSIONS.includes(row.permission))result[row.permission]=!!decision;};
    apply(overrides.filter(o=>roles.some(r=>r.is_default && r.id===o.role_id)));
    apply(overrides.filter(o=>roles.some(r=>!r.is_default && r.id===o.role_id)));
  }
  if(m.timeout_until && Date.parse(m.timeout_until)>Date.now()) for(const k of ['sendMessages','addReactions','createThreads','speak','video','stream'])result[k]=false;
  return result;
}
export async function requirePermission(userId,serverId,permission,channel=null,tx=db) {if(!(await permissionsFor(userId,serverId,channel,tx))[permission])deny();}
export async function accessibleChannel(userId,id,type,permission='viewChannel',tx=db) {
  const c=await tx.queryOne('SELECT * FROM channels WHERE id=$1 AND deleted_at IS NULL',[id]);
  if(!c || type && c.type!==type)return null;
  const p=await permissionsFor(userId,c.server_id,c,tx);
  const m=await serverMembership(userId,c.server_id,tx);
  return p.viewChannel && p[permission]?{...c,permissions:p,serverVoice:{muted:!!m?.voice_muted,deafened:!!m?.voice_deafened}}:null;
}
export async function requireHierarchy(actorId,targetId,serverId,tx=db) {
  if(actorId===targetId)deny('Não é possível moderar a própria conta');
  const m=await serverMembership(actorId,serverId,tx);if(!m)deny();
  if(targetId===m.owner_id)deny('O proprietário não pode ser moderado');
  if(actorId===m.owner_id)return;
  const max=roles=>Math.max(0,...roles.map(r=>Number(r.position)));
  if(max(await rolesFor(actorId,serverId,tx))<=max(await rolesFor(targetId,serverId,tx)))deny('Você só pode gerenciar membros com cargos abaixo do seu');
}
export async function audit(tx,serverId,actorId,action,targetId,detail={}) {
  await tx.query('INSERT INTO audit_entries(id,server_id,actor_id,action,target_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),serverId,actorId,action,targetId,JSON.stringify(detail),new Date().toISOString()]);
}
