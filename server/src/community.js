import {visibleServerUser} from './profiles.js';
import crypto from 'node:crypto';
import db from './db.js';
import {route,fail,publicUser,visibleUser} from './auth.js';
import {PERMISSIONS,CHANNEL_PERMISSIONS,DEFAULT_PERMISSIONS,parseJson,serverMembership,rolesFor,permissionsFor,requirePermission,requireHierarchy,accessibleChannel,audit,deny} from './permissions.js';

const title=value=>{if(typeof value!=='string' || !value.trim() || value.length>100)fail(400,'Nome inválido');return value.trim();};
const integer=(v,max=86400)=>{if(!Number.isSafeInteger(v) || v<0 || v>max)fail(400,'Valor inválido');return v;};
export async function serverView(userId,id) {
  const membership=await serverMembership(userId,id);if(!membership)return null;
  const server=await db.queryOne('SELECT * FROM servers WHERE id=$1',[id]),channels=[];
  for(const row of await db.query('SELECT id FROM channels WHERE server_id=$1 AND deleted_at IS NULL ORDER BY position,name',[id])){const c=await accessibleChannel(userId,row.id);if(c)channels.push(c);}
  const categories=await db.query('SELECT * FROM categories WHERE server_id=$1 AND deleted_at IS NULL ORDER BY position,name',[id]);
  const visibleCategories=[];for(const category of categories)if((await permissionsFor(userId,id,{category_id:category.id,permission_sync:1})).viewChannel || channels.some(c=>c.category_id===category.id))visibleCategories.push(category);
  return {...server,channels,categories:visibleCategories,permissions:await permissionsFor(userId,id)};
}
export function installCommunity(app,io,activeUsers,realtime,publishPresence) {
  async function refresh(serverId) {
    for(const socket of io.sockets.sockets.values()) {
      const user=socket.data.user.id,view=await serverView(user,serverId);
      const ids=(await db.query('SELECT id FROM channels WHERE server_id=$1',[serverId])).map(c=>c.id);
      for(const id of ids){if(view?.channels.some(c=>c.id===id))socket.join(`channel_${id}`);else socket.leave(`channel_${id}`);}
      const voiceId=ids.find(id=>realtime.roomOf?.(socket.id)===id);
      if(voiceId && !await accessibleChannel(user,voiceId,'voice','connect')){realtime.leave(socket);socket.emit('voice_removed',{reason:'Seu acesso ao canal foi removido'});}
      if(view){socket.join(`server_${serverId}`);socket.emit('server_updated',view);}else {socket.leave(`server_${serverId}`);socket.emit('server_removed',{id:serverId});}
    }
    publishPresence();
  }
  const changed=async(req,action,target,fn)=>{await db.transaction(async tx=>{await fn(tx);await audit(tx,req.params.id,req.user.id,action,target);});await refresh(req.params.id);};
  app.get('/api/permissions',(_req,res)=>res.json(PERMISSIONS));
  app.get('/api/servers/:id/community',route(async(req,res)=>{
    const view=await serverView(req.user.id,req.params.id);if(!view)deny();
    const roles=await db.query('SELECT * FROM roles WHERE server_id=$1 ORDER BY position DESC',[req.params.id]);
    const members=await db.query("SELECT u.*,a.login_name,m.nickname,m.timeout_until FROM server_members m JOIN users u ON u.id=m.user_id LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE m.server_id=$1 AND u.account_state<>'deleted' ORDER BY u.username",[req.params.id]);
    const result=[];for(const u of members){const online=Object.values(activeUsers).find(x=>x.id===u.id);result.push({...await visibleServerUser(req.user.id,u,req.params.id),status:online?.status || 'offline',nickname:u.nickname,timeoutUntil:u.timeout_until,roles:await rolesFor(u.id,req.params.id)});}
    res.json({server:view,roles,members:result,permissions:PERMISSIONS,channelPermissions:CHANNEL_PERMISSIONS});
  }));
  app.get('/api/servers/:id/members',route(async(req,res)=>{
    if(!await serverMembership(req.user.id,req.params.id))deny();
    const rows=await db.query("SELECT u.*,a.login_name,m.nickname FROM server_members m JOIN users u ON u.id=m.user_id LEFT JOIN auth_accounts a ON a.user_id=u.id WHERE m.server_id=$1 AND u.account_state<>'deleted' ORDER BY u.username",[req.params.id]),out=[];
    for(const u of rows)out.push({...await visibleServerUser(req.user.id,u,req.params.id),nickname:u.nickname,status:Object.values(activeUsers).find(p=>p.id===u.id)?.status || 'offline',roles:await rolesFor(u.id,req.params.id)});res.json(out);
  }));
  app.patch('/api/servers/:id/details',route(async(req,res)=>{
    await requirePermission(req.user.id,req.params.id,'manageServer');
    const b=req.body,name=title(b.name),description=String(b.description || '').slice(0,1000),icon=String(b.icon || '').slice(0,2000),banner=String(b.banner || '').slice(0,2000);
    for(const asset of [icon,banner])if(asset.startsWith('/uploads/') && !await db.queryOne('SELECT filename FROM upload_records WHERE filename=$1 AND owner_id=$2',[asset.slice(9),req.user.id]))deny('Arquivo pertence a outra conta');
    await changed(req,'server.update',req.params.id,async tx=>{await tx.query('UPDATE servers SET name=$1,description=$2,icon=$3,banner=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$5',[name,description,icon,banner,req.params.id]);for(const asset of [icon,banner])if(asset.startsWith('/uploads/'))await tx.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2',[req.params.id,asset.slice(9)]);});res.json(await serverView(req.user.id,req.params.id));
  }));
  app.post('/api/servers/:id/leave',route(async(req,res)=>{const m=await serverMembership(req.user.id,req.params.id);if(!m)deny();if(m.owner_id===req.user.id)fail(409,'Transfira a propriedade antes de sair');await changed(req,'member.leave',req.user.id,async tx=>{await tx.query('DELETE FROM member_roles WHERE server_id=$1 AND user_id=$2',[req.params.id,req.user.id]);await tx.query('DELETE FROM server_members WHERE server_id=$1 AND user_id=$2',[req.params.id,req.user.id]);});res.sendStatus(204);}));
  app.delete('/api/servers/:id',route(async(req,res)=>{const m=await serverMembership(req.user.id,req.params.id);if(m?.owner_id!==req.user.id)deny();await changed(req,'server.delete',req.params.id,tx=>tx.query('UPDATE servers SET deleted_at=$1 WHERE id=$2',[new Date().toISOString(),req.params.id]));res.sendStatus(204);}));
  app.post('/api/servers/:id/transfer',route(async(req,res)=>{const m=await serverMembership(req.user.id,req.params.id);if(m?.owner_id!==req.user.id || !await serverMembership(req.body.userId,req.params.id) || !await db.queryOne("SELECT id FROM users WHERE id=$1 AND account_state='active'",[req.body.userId]))deny();await changed(req,'server.transfer',req.body.userId,tx=>tx.query('UPDATE servers SET owner_id=$1 WHERE id=$2',[req.body.userId,req.params.id]));res.sendStatus(204);}));
  app.post('/api/servers/:id/categories',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageChannels');const id=crypto.randomUUID(),name=title(req.body.name);await changed(req,'category.create',id,tx=>tx.query('INSERT INTO categories(id,server_id,name,position) VALUES($1,$2,$3,$4)',[id,req.params.id,name,integer(req.body.position || 0,10000)]));res.status(201).json({id,name});}));
  app.patch('/api/servers/:id/categories/:categoryId',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageChannels');if(!await db.queryOne('SELECT id FROM categories WHERE id=$1 AND server_id=$2 AND deleted_at IS NULL',[req.params.categoryId,req.params.id]))fail(404,'Categoria indisponível');await changed(req,'category.update',req.params.categoryId,tx=>tx.query('UPDATE categories SET name=$1,position=$2 WHERE id=$3',[title(req.body.name),integer(req.body.position || 0,10000),req.params.categoryId]));res.sendStatus(204);}));
  app.delete('/api/servers/:id/categories/:categoryId',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageChannels');await changed(req,'category.delete',req.params.categoryId,async tx=>{await tx.query('UPDATE categories SET deleted_at=$1 WHERE id=$2 AND server_id=$3',[new Date().toISOString(),req.params.categoryId,req.params.id]);await tx.query('UPDATE channels SET category_id=NULL WHERE category_id=$1 AND server_id=$2',[req.params.categoryId,req.params.id]);});res.sendStatus(204);}));
  app.patch('/api/servers/:id/channels/:channelId',route(async(req,res)=>{
    await requirePermission(req.user.id,req.params.id,'manageChannels');const channel=await db.queryOne('SELECT * FROM channels WHERE id=$1 AND server_id=$2 AND deleted_at IS NULL',[req.params.channelId,req.params.id]);if(!channel)fail(404,'Canal indisponível');
    const b={...channel,...req.body};if(b.category_id && !await db.queryOne('SELECT id FROM categories WHERE id=$1 AND server_id=$2 AND deleted_at IS NULL',[b.category_id,req.params.id]))fail(400,'Categoria inválida');
    await changed(req,'channel.update',channel.id,tx=>tx.query('UPDATE channels SET name=$1,topic=$2,category_id=$3,position=$4,slowmode=$5,user_limit=$6,permission_sync=$7,nsfw=$8 WHERE id=$9',[title(b.name),String(b.topic || '').slice(0,1000),b.category_id || null,integer(b.position,10000),integer(b.slowmode,21600),integer(b.user_limit,1000),b.permission_sync?1:0,b.nsfw?1:0,channel.id]));res.json(await accessibleChannel(req.user.id,channel.id));
  }));
  app.delete('/api/servers/:id/channels/:channelId',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageChannels');await changed(req,'channel.delete',req.params.channelId,tx=>tx.query('UPDATE channels SET deleted_at=$1 WHERE id=$2 AND server_id=$3',[new Date().toISOString(),req.params.channelId,req.params.id]));res.sendStatus(204);}));
  app.put('/api/servers/:id/order',route(async(req,res)=>{const {kind,ids}=req.body;await requirePermission(req.user.id,req.params.id,kind==='roles'?'manageRoles':'manageChannels');if(!['channels','categories','roles'].includes(kind) || !Array.isArray(ids) || ids.length>1000 || ids.some(x=>typeof x!=='string') || new Set(ids).size!==ids.length)fail(400,'Ordem inválida');if(kind==='roles')await requirePermission(req.user.id,req.params.id,'manageRoles');await changed(req,`${kind}.reorder`,req.params.id,async tx=>{if(kind==='roles'){const current=await rolesFor(req.user.id,req.params.id,tx),max=Math.max(0,...current.map(r=>r.position)),owner=(await serverMembership(req.user.id,req.params.id,tx)).owner_id===req.user.id;for(let i=0;i<ids.length;i++){const r=await tx.queryOne('SELECT * FROM roles WHERE id=$1 AND server_id=$2',[ids[i],req.params.id]);if(!r || r.is_default || !owner && (r.position>=max || i+1>=max))deny('Ordem de cargos inválida');}}for(let i=0;i<ids.length;i++)await tx.query(`UPDATE ${kind} SET position=$1 WHERE id=$2 AND server_id=$3`,[kind==='roles'?i+1:i,ids[i],req.params.id]);});res.sendStatus(204);}));
  app.post('/api/servers/:id/roles',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageRoles');const id=crypto.randomUUID(),name=title(req.body.name);await changed(req,'role.create',id,tx=>tx.query('INSERT INTO roles(id,server_id,name,permissions,position) VALUES($1,$2,$3,$4,$5)',[id,req.params.id,name,'{}',1]));res.status(201).json({id,name});}));
  async function editableRole(req,tx=db) {
    await requirePermission(req.user.id,req.params.id,'manageRoles',null,tx);const r=await tx.queryOne('SELECT * FROM roles WHERE id=$1 AND server_id=$2',[req.params.roleId,req.params.id]);if(!r)fail(404,'Cargo indisponível');
    const m=await serverMembership(req.user.id,req.params.id,tx),owned=m.owner_id===req.user.id,max=Math.max(0,...(await rolesFor(req.user.id,req.params.id,tx)).map(x=>x.position));if(!owned && r.position>=max)deny('Cargo fora da sua hierarquia');return {role:r,owned,max};
  }
  app.put('/api/servers/:id/roles/:roleId',route(async(req,res)=>{
    await changed(req,'role.update',req.params.roleId,async tx=>{const {role,owned,max}=await editableRole(req,tx),permissions=parseJson(JSON.stringify(req.body.permissions || {})),allowed=await permissionsFor(req.user.id,req.params.id,null,tx);for(const[k,v]of Object.entries(permissions))if(!PERMISSIONS.includes(k) || typeof v!=='boolean' || v && !allowed[k])deny('Você não pode conceder esta permissão');const position=role.is_default?0:integer(req.body.position || role.position,10000);if(!owned && position>=max)deny();if(!/^#[0-9a-f]{6}$/i.test(req.body.color || '#99aab5'))fail(400,'Cor inválida');await tx.query('UPDATE roles SET name=$1,color=$2,position=$3,permissions=$4,hoist=$5 WHERE id=$6',[role.is_default?'@everyone':title(req.body.name),req.body.color || '#99aab5',position,JSON.stringify(permissions),req.body.hoist?1:0,role.id]);});res.sendStatus(204);
  }));
  app.delete('/api/servers/:id/roles/:roleId',route(async(req,res)=>{await changed(req,'role.delete',req.params.roleId,async tx=>{const {role}=await editableRole(req,tx);if(role.is_default)deny('O cargo padrão não pode ser removido');await tx.query('DELETE FROM permission_overrides WHERE role_id=$1',[role.id]);await tx.query('DELETE FROM member_roles WHERE role_id=$1',[role.id]);await tx.query('UPDATE server_members SET role_id=NULL WHERE role_id=$1',[role.id]);await tx.query('DELETE FROM roles WHERE id=$1',[role.id]);});res.sendStatus(204);}));
  app.put('/api/servers/:id/overrides',route(async(req,res)=>{
    await requirePermission(req.user.id,req.params.id,'manageRoles');const {scopeKind,scopeId,roleId,decisions}=req.body;if(!['category','channel'].includes(scopeKind))fail(400,'Escopo inválido');const scope=await db.queryOne(`SELECT id FROM ${scopeKind==='category'?'categories':'channels'} WHERE id=$1 AND server_id=$2 AND deleted_at IS NULL`,[scopeId,req.params.id]);if(!scope)deny();const role=await db.queryOne('SELECT id FROM roles WHERE id=$1 AND server_id=$2',[roleId,req.params.id]);if(!role)deny();
    const allowed=await permissionsFor(req.user.id,req.params.id);for(const[k,v]of Object.entries(decisions || {}))if(!CHANNEL_PERMISSIONS.includes(k) || ![-1,0,1].includes(v) || v===1 && !allowed[k])deny('Permissão inválida');
    await changed(req,'permissions.update',scopeId,async tx=>{await tx.query('DELETE FROM permission_overrides WHERE scope_kind=$1 AND scope_id=$2 AND role_id=$3',[scopeKind,scopeId,roleId]);for(const[k,v]of Object.entries(decisions || {}))if(v!==-1)await tx.query('INSERT INTO permission_overrides(scope_kind,scope_id,role_id,permission,decision) VALUES($1,$2,$3,$4,$5)',[scopeKind,scopeId,roleId,k,v]);});res.sendStatus(204);
  }));
  app.get('/api/servers/:id/overrides',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'manageRoles');const scopes=await db.query('SELECT id FROM channels WHERE server_id=$1 UNION SELECT id FROM categories WHERE server_id=$1',[req.params.id]),out=[];for(const s of scopes)out.push(...await db.query('SELECT * FROM permission_overrides WHERE scope_id=$1',[s.id]));res.json(out);}));
  app.put('/api/servers/:id/members/:userId',route(async(req,res)=>{
    const id=req.params.userId,b=req.body;if(!await serverMembership(id,req.params.id))fail(404,'Membro indisponível');
    await changed(req,'member.update',id,async tx=>{
      if(b.nickname!=null){await requirePermission(req.user.id,req.params.id,id===req.user.id?'changeNickname':'manageNicknames',null,tx);if(id!==req.user.id)await requireHierarchy(req.user.id,id,req.params.id,tx);await tx.query('UPDATE server_members SET nickname=$1 WHERE server_id=$2 AND user_id=$3',[String(b.nickname).slice(0,32),req.params.id,id]);}
      if(b.roles){if(!Array.isArray(b.roles) || b.roles.length>50)fail(400,'Cargos inválidos');await requirePermission(req.user.id,req.params.id,'manageRoles',null,tx);await requireHierarchy(req.user.id,id,req.params.id,tx);const m=await serverMembership(req.user.id,req.params.id,tx),max=Math.max(0,...(await rolesFor(req.user.id,req.params.id,tx)).map(x=>x.position));const old=await rolesFor(id,req.params.id,tx);for(const roleId of new Set([...b.roles,...old.filter(r=>!r.is_default).map(r=>r.id)])){const r=await tx.queryOne('SELECT * FROM roles WHERE id=$1 AND server_id=$2',[roleId,req.params.id]);if(!r || r.is_default || m.owner_id!==req.user.id && r.position>=max)deny('Cargo fora da sua hierarquia');}await tx.query('DELETE FROM member_roles WHERE server_id=$1 AND user_id=$2',[req.params.id,id]);for(const roleId of b.roles)await tx.query('INSERT INTO member_roles(server_id,user_id,role_id) VALUES($1,$2,$3)',[req.params.id,id,roleId]);}
    });res.sendStatus(204);
  }));
  for(const action of ['kick','ban','timeout'])app.post(`/api/servers/:id/members/:userId/${action}`,route(async(req,res)=>{
    const target=req.params.userId,reason=String(req.body.reason || '').slice(0,1000);await changed(req,`member.${action}`,target,async tx=>{await requirePermission(req.user.id,req.params.id,action==='ban'?'banMembers':action==='kick'?'kickMembers':'muteMembers',null,tx);await requireHierarchy(req.user.id,target,req.params.id,tx);
      if(action==='timeout'){const seconds=integer(req.body.seconds ?? 600,2419200);await tx.query('UPDATE server_members SET timeout_until=$1 WHERE server_id=$2 AND user_id=$3',[seconds?new Date(Date.now()+seconds*1000).toISOString():null,req.params.id,target]);}
      else {if(action==='ban'){if(!await tx.queryOne('SELECT id FROM users WHERE id=$1',[target]))fail(404,'Conta indisponível');await tx.query('INSERT INTO server_bans(server_id,user_id,moderator_id,reason,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(server_id,user_id) DO UPDATE SET reason=$4,moderator_id=$3',[req.params.id,target,req.user.id,reason,new Date().toISOString()]);}await tx.query('DELETE FROM member_roles WHERE server_id=$1 AND user_id=$2',[req.params.id,target]);await tx.query('DELETE FROM server_members WHERE server_id=$1 AND user_id=$2',[req.params.id,target]);}
      if(req.body.deleteRecentSeconds){const seconds=integer(req.body.deleteRecentSeconds,604800);await requirePermission(req.user.id,req.params.id,'manageMessages',null,tx);await tx.query('UPDATE messages SET deleted_at=$1 WHERE sender_id=$2 AND channel_id IN (SELECT id FROM channels WHERE server_id=$3) AND timestamp>$4',[new Date().toISOString(),target,req.params.id,new Date(Date.now()-seconds*1000).toISOString()]);}
    });res.sendStatus(204);
  }));
  app.get('/api/servers/:id/bans',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'banMembers');res.json(await db.query('SELECT b.*,u.username FROM server_bans b JOIN users u ON u.id=b.user_id WHERE server_id=$1',[req.params.id]));}));
  app.delete('/api/servers/:id/bans/:userId',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'banMembers');await changed(req,'member.unban',req.params.userId,tx=>tx.query('DELETE FROM server_bans WHERE server_id=$1 AND user_id=$2',[req.params.id,req.params.userId]));res.sendStatus(204);}));
  app.get('/api/servers/:id/audit',route(async(req,res)=>{await requirePermission(req.user.id,req.params.id,'viewAudit');res.json((await db.query('SELECT e.*,u.username FROM audit_entries e LEFT JOIN users u ON u.id=e.actor_id WHERE server_id=$1 ORDER BY created_at DESC LIMIT 200',[req.params.id])).map(r=>({...r,detail:parseJson(r.detail)})));}));
  return {refresh};
}
