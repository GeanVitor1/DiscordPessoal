export function notificationRule(settings={},route={}){const rules=settings.notifications || {};return rules.channels?.[route.channelId] || rules.servers?.[route.serverId] || rules.default || {mode:'all'};}
export function notificationAllowed(settings={},route={},mention=false,now=Date.now()){
 const rule=notificationRule(settings,route);
 if(rule.mutedUntil && Date.parse(rule.mutedUntil)>now)return false;
 return rule.mode!=='none' && (rule.mode!=='mentions' || mention);
}
export function isMention(content,user){return [user.handle, 'everyone',user.status!=='offline'?'here':null].filter(Boolean).some(handle=>new RegExp('(^|\\s)@'+handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|\\W)','i').test(content || '')) || String(content || '').includes(`<@${user.id}>`);}
export function unreadCount(settings,channel){if(!notificationAllowed(settings,channel,true))return 0;return notificationRule(settings,channel).mode==='mentions'?(channel.mentions || 0):channel.unread;}
