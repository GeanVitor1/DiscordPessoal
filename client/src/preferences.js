export const SOUND_EVENTS=['message','mention','self_join','join','leave','moved','mute','unmute','deafen','undeafen','call_incoming','call_outgoing','disconnect','screenshare_on','screenshare_off','stream_join','stream_leave','camera_on','camera_off'];
export const DEFAULT_PREFERENCES = Object.freeze({theme:'dark',accent:'#5865f2',fontSize:14,compact:false,reduceMotion:false,showMembers:true,sounds:true,desktopNotifications:true,notificationPreview:true,zoom:1,uiScale:1,highContrast:false,showAvatars:true,linkPreviews:true,showGifs:true,autoPlayGifs:true,effectVolume:0.7,soundEvents:Object.fromEntries(SOUND_EVENTS.map(k=>[k,true])),language:'pt-BR'});
export const THEMES = [{id:'dark',name:'Escuro'},{id:'light',name:'Claro'},{id:'midnight',name:'Meia-noite'},{id:'forest',name:'Floresta'},{id:'sunset',name:'Pôr do sol'},{id:'system',name:'Sistema'}];
export function normalizePreferences(value) {
  const source=value && typeof value==='object'?value:{};
  const p={...DEFAULT_PREFERENCES};
  if(THEMES.some(t=>t.id===source.theme)) p.theme=source.theme;
  if(/^#[a-f\d]{6}$/i.test(source.accent)) p.accent=source.accent;
  if(Number.isFinite(source.fontSize)) p.fontSize=Math.min(20,Math.max(12,source.fontSize));
  for(const key of ['compact','reduceMotion','showMembers','sounds','desktopNotifications','notificationPreview','highContrast','showAvatars','linkPreviews','showGifs','autoPlayGifs']) if(typeof source[key]==='boolean') p[key]=source[key];
  for(const [key,min,max]of [['zoom',0.75,1.5],['uiScale',0.75,1.5],['effectVolume',0,1]])if(Number.isFinite(source[key]))p[key]=Math.max(min,Math.min(max,source[key]));
  p.soundEvents={...DEFAULT_PREFERENCES.soundEvents};for(const key of SOUND_EVENTS)if(typeof source.soundEvents?.[key]==='boolean')p.soundEvents[key]=source.soundEvents[key];
  if(['pt-BR','en'].includes(source.language))p.language=source.language;
  return p;
}
let active=DEFAULT_PREFERENCES;
export const getPreferences=()=>active;
export const setActivePreferences=value=>{active=normalizePreferences(value);};
