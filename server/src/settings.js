import db from './db.js';
import {parseJson} from './permissions.js';
export const DEFAULT_SOCIAL_SETTINGS={friendRequests:{everyone:true,friendsOfFriends:false,sharedServers:false},profileVisibility:'shared',activityVisibility:'shared',allowActivity:true,dmPolicy:'friends',callPolicy:'friends',blockedDmServers:[],notifications:{default:{mode:'all',mutedUntil:null},servers:{},channels:{}},preferences:{}};
export function normalizeSettings(value={}) {
  const out=structuredClone(DEFAULT_SOCIAL_SETTINGS);
  for(const key of ['profileVisibility','activityVisibility','dmPolicy','callPolicy'])if(['everyone','shared','friends','none'].includes(value[key]))out[key]=value[key];
  if(typeof value.allowActivity==='boolean')out.allowActivity=value.allowActivity;
  for(const k of Object.keys(out.friendRequests))if(typeof value.friendRequests?.[k]==='boolean')out.friendRequests[k]=value.friendRequests[k];
  out.blockedDmServers=Array.isArray(value.blockedDmServers)?value.blockedDmServers.filter(x=>typeof x==='string').slice(0,200):[];
  for(const scope of ['default','servers','channels']) {
    const clean=v=>({mode:['all','mentions','none'].includes(v?.mode)?v.mode:'all',mutedUntil:v?.mutedUntil && Number.isFinite(Date.parse(v.mutedUntil))?new Date(v.mutedUntil).toISOString():null});
    out.notifications[scope]=scope==='default'?clean(value.notifications?.default):Object.fromEntries(Object.entries(value.notifications?.[scope] || {}).filter(([k])=>/^[\w:-]{1,100}$/.test(k)).slice(0,500).map(([k,v])=>[k,clean(v)]));
  }
  if(value.preferences && typeof value.preferences==='object' && !Array.isArray(value.preferences)){const encoded=JSON.stringify(value.preferences);if(encoded.length<=16000)out.preferences=JSON.parse(encoded);}
  return out;
}
export async function userSettings(userId,tx=db) {return normalizeSettings(parseJson((await tx.queryOne('SELECT value FROM user_settings WHERE user_id=$1',[userId]))?.value));}
export async function socialRelation(a,b,tx=db) {
  const friend=!!await tx.queryOne("SELECT state FROM friendships WHERE ((user_low=$1 AND user_high=$2) OR (user_low=$2 AND user_high=$1)) AND state='accepted'",[a,b]);
  const shared=await tx.query('SELECT x.server_id FROM server_members x JOIN server_members y ON x.server_id=y.server_id JOIN servers s ON s.id=x.server_id WHERE x.user_id=$1 AND y.user_id=$2 AND s.deleted_at IS NULL',[a,b]);
  return {friend,shared:shared.map(r=>r.server_id)};
}
export const policyAllows=(policy,relation)=>policy==='everyone' || policy==='friends' && relation.friend || policy==='shared' && (relation.friend || relation.shared.length>0);
export async function friendshipAllowed(from,to,tx=db) {
  const settings=await userSettings(to,tx),policy=settings.friendRequests;if(policy.everyone)return true;
  if(policy.sharedServers && (await socialRelation(from,to,tx)).shared.length)return true;
  if(policy.friendsOfFriends) {
    const links=await tx.query("SELECT user_low,user_high FROM friendships WHERE (user_low=$1 OR user_high=$1) AND state='accepted'",[from]);
    for(const link of links)if((await socialRelation(link.user_low===from?link.user_high:link.user_low,to,tx)).friend)return true;
  }
  return false;
}
