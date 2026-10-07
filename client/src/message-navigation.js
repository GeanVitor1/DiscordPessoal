let pending=null;
export function requestMessageNavigation(route){pending=route;window.dispatchEvent(new CustomEvent('navigate-message',{detail:route}));}
export function watchMessageNavigation(kind,id,jump){const consume=()=>{if(pending?.kind===kind && pending.contextId===id || kind==='channels' && pending?.kind==='threads' && pending.channelId===id){const route=pending;pending=null;jump(route.id,route);}};window.addEventListener('navigate-message',consume);consume();return()=>window.removeEventListener('navigate-message',consume);}
