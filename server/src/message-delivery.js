// Called only after the authenticated message transaction has committed.
// Confirm the sender before unrelated viewers' profile/privacy queries.
export async function deliverChannelMessage({io,message,senderSocket,rolesFor,visibleServerUser,ack,onError=()=>{}}) {
  const receivers=[...io.sockets.sockets.values()].filter(s=>s.rooms.has(`channel_${message.channelId}`));
  const roleMention=message.content.includes('<@&');
  const deliver=async receiver=>{
    const me=receiver.data.user.id;
    const mentioned=message.content.includes(`<@${me}>`) || roleMention && (await rolesFor(me,message.serverId)).some(r=>message.content.includes(`<@&${r.id}>`));
    const visible={...message,mentioned,sender:await visibleServerUser(me,message.sender,message.serverId)};
    receiver.emit('new_message',visible);
    return visible;
  };
  let ownMessage=message;
  try {if(receivers.includes(senderSocket))ownMessage=await deliver(senderSocket);}catch(e){onError(e);}
  // A failed downstream delivery must not claim that a durable insert failed.
  ack({ok:true,id:message.id,message:ownMessage});
  for(const receiver of receivers)if(receiver!==senderSocket){try{await deliver(receiver);}catch(e){onError(e);}}
}
