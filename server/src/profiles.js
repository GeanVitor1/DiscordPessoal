import db from './db.js';
import {route,fail,visibleUser} from './auth.js';
import {serverMembership,parseJson} from './permissions.js';
export async function scopedProfile(userId,serverId,tx=db){const row=await tx.queryOne('SELECT value FROM server_profiles WHERE server_id=$1 AND user_id=$2',[serverId,userId]);return parseJson(row?.value);}
export async function visibleServerUser(viewer,u,serverId,tx=db){const user=await visibleUser(viewer,u,tx);if(!serverId || !Object.hasOwn(user,'bio'))return {...user,serverId};const p=await scopedProfile(user.id,serverId,tx),member=await serverMembership(user.id,serverId,tx);return {...user,...Object.fromEntries(Object.entries(p).filter(([k,v])=>v && k!=='displayName')),username:p.displayName || member?.nickname || user.username,globalUsername:user.username,serverId};}
export function installProfiles(app,io,publishPresence){
  app.get('/api/servers/:id/profile',route(async(req,res)=>{if(!await serverMembership(req.user.id,req.params.id))fail(403,'Servidor indisponível');res.json(await scopedProfile(req.user.id,req.params.id));}));
  app.put('/api/servers/:id/profile',route(async(req,res)=>{
    if(!await serverMembership(req.user.id,req.params.id))fail(403,'Servidor indisponível');const profile={},b=req.body;
    for(const[key,max]of [['displayName',32],['bio',1000],['pronouns',128]])if(b[key]!=null){if(typeof b[key]!=='string' || b[key].length>max)fail(400,'Perfil inválido');profile[key]=b[key];}
    if(b.bannerColor!=null){if(!/^#[a-f0-9]{6}$/i.test(b.bannerColor))fail(400,'Cor inválida');profile.bannerColor=b.bannerColor;}
    for(const key of ['avatar','banner'])if(b[key]!=null){if(typeof b[key]!=='string' || b[key].length>2000)fail(400,'Imagem inválida');if(b[key]){const file=b[key].match(/^\/uploads\/([\w.-]+)$/)?.[1];if(file){if(!await db.queryOne('SELECT filename FROM upload_records WHERE filename=$1 AND owner_id=$2',[file,req.user.id]))fail(403,'Imagem pertence a outra conta');}else{let u;try{u=new URL(b[key]);}catch{fail(400,'Imagem inválida');}if(u.protocol!=='https:' || u.username || u.password)fail(400,'Use uma imagem HTTPS sem credenciais');}}profile[key]=b[key];}
    await db.transaction(async tx=>{await tx.query('INSERT INTO server_profiles(server_id,user_id,value) VALUES($1,$2,$3) ON CONFLICT(server_id,user_id) DO UPDATE SET value=$3',[req.params.id,req.user.id,JSON.stringify(profile)]);for(const key of ['avatar','banner'])if(profile[key]?.startsWith('/uploads/'))await tx.query('UPDATE upload_records SET server_id=$1 WHERE filename=$2 AND owner_id=$3',[req.params.id,profile[key].slice(9),req.user.id]);});
    io.to(`server_${req.params.id}`).emit('member_profile_changed',{serverId:req.params.id,userId:req.user.id});publishPresence();res.json(profile);
  }));
  app.delete('/api/servers/:id/profile',route(async(req,res)=>{if(!await serverMembership(req.user.id,req.params.id))fail(403,'Servidor indisponível');await db.query('DELETE FROM server_profiles WHERE server_id=$1 AND user_id=$2',[req.params.id,req.user.id]);io.to(`server_${req.params.id}`).emit('member_profile_changed',{serverId:req.params.id,userId:req.user.id});publishPresence();res.sendStatus(204);}));
}
