import db from './db.js';
import {fail} from './auth.js';
import {accessibleChannel,requirePermission,requireHierarchy,audit} from './permissions.js';
export function voiceModerator(io,voiceRooms,realtime,publishPresence) {
  return async(socket,data)=>{
    const c=await accessibleChannel(socket.data.user.id,data.channelId,'voice'),target=voiceRooms[data.channelId]?.find(p=>p.socketId===data.targetSocketId),peer=io.sockets.sockets.get(data.targetSocketId);
    if(!c || !target || !peer)fail(403,'Participante indisponível');const action=data.action;
    if(!['mute','deafen','disconnect','move'].includes(action))fail(400,'Ação inválida');
    await requirePermission(socket.data.user.id,c.server_id,action==='mute'?'muteMembers':action==='deafen'?'deafenMembers':'moveMembers',c);await requireHierarchy(socket.data.user.id,target.user.id,c.server_id);
    let destination;if(action==='move'){destination=await accessibleChannel(target.user.id,data.destinationId,'voice','connect');if(!destination || destination.server_id!==c.server_id)fail(403,'Canal de destino indisponível');if(destination.user_limit && (voiceRooms[destination.id]?.length || 0)>=destination.user_limit)fail(409,'Canal de destino lotado');}
    await db.transaction(async tx=>{if(action==='mute' || action==='deafen')await tx.query(`UPDATE server_members SET ${action==='mute'?'voice_muted':'voice_deafened'}=$1 WHERE server_id=$2 AND user_id=$3`,[data.value===false?0:1,c.server_id,target.user.id]);await audit(tx,c.server_id,socket.data.user.id,`voice.${action}`,target.user.id,{channelId:c.id,destinationId:destination?.id});});
    if(action==='disconnect'){realtime.leave(peer);peer.emit('voice_removed',{reason:'Um moderador desconectou você do canal'});}
    else if(action==='move'){realtime.leave(peer);peer.emit('voice_moved',{channel:destination});}
    else{target[action==='mute'?'serverMuted':'serverDeafened']=data.value!==false;if(action==='mute')target.isMuted=target.serverMuted || target.isMuted;if(action==='deafen')target.isDeafened=target.serverDeafened || target.isDeafened;peer.emit('voice_moderation',{isServerMuted:target.serverMuted,isServerDeafened:target.serverDeafened});}
    publishPresence();return {ok:true};
  };
}
