import db from './db.js';
import {route} from './auth.js';
import {accessibleChannel,rolesFor} from './permissions.js';
export function installNotifications(app,io){
 app.get('/api/notifications/unread',route(async(req,res)=>{
  const channels=await db.query("SELECT c.id,c.server_id FROM channels c JOIN server_members p ON p.server_id=c.server_id WHERE p.user_id=$1 AND c.type='text' AND c.deleted_at IS NULL",[req.user.id]),result=[];
  for(const c of channels){if(!await accessibleChannel(req.user.id,c.id,'text','readHistory'))continue;const read=await db.queryOne("SELECT * FROM conversation_reads WHERE kind='channels' AND context_id=$1 AND user_id=$2",[c.id,req.user.id]);const params=[c.id,req.user.id,read?.read_at || '1970-01-01'],n=await db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE channel_id=$1 AND sender_id<>$2 AND deleted_at IS NULL AND timestamp>$3',params),rows=await db.query('SELECT content FROM messages WHERE channel_id=$1 AND sender_id<>$2 AND deleted_at IS NULL AND timestamp>$3 ORDER BY timestamp DESC LIMIT 10000',params),roles=await rolesFor(req.user.id,c.server_id),handle=req.user.handle?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(`(^|\\s)@(?:${handle || 'NO_MATCH'}|everyone|here)(?=$|\\W)`,'i');const mentions=rows.filter(m=>m.content?.includes(`<@${req.user.id}>`) || pattern.test(m.content || '') || roles.some(r=>m.content?.includes(`<@&${r.id}>`))).length;result.push({channelId:c.id,serverId:c.server_id,unread:read?.manual_unread?Math.max(1,Number(n.n)):Number(n.n),mentions});}res.json(result);
 }));
}
