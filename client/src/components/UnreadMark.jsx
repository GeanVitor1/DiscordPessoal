import React from 'react';
import {useSocial} from '../context/SocialContext';
import {unreadCount} from '../notifications';
export default function UnreadMark({channelId,serverId}){const{channelUnreads,notificationSettings}=useSocial();const count=channelUnreads.filter(c=>channelId?c.channelId===channelId:c.serverId===serverId).reduce((n,c)=>n+unreadCount(notificationSettings,c),0);return count>0?<span aria-label={`${count} mensagens não lidas`} className="rounded-full bg-discord-red text-white px-1.5 text-[10px] ml-auto">{count>99?'99+':count}</span>:null;}
