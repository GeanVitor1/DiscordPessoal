export const DEFAULT_PREFERENCES = Object.freeze({theme:'dark',accent:'#5865f2',fontSize:14,compact:false,reduceMotion:false,showMembers:true,sounds:true,desktopNotifications:true,notificationPreview:true});
export const THEMES = [{id:'dark',name:'Escuro'},{id:'light',name:'Claro'},{id:'midnight',name:'Meia-noite'},{id:'forest',name:'Floresta'},{id:'sunset',name:'Pôr do sol'},{id:'system',name:'Sistema'}];
export function normalizePreferences(value) {
  const source=value && typeof value==='object'?value:{};
  const p={...DEFAULT_PREFERENCES};
  if(THEMES.some(t=>t.id===source.theme)) p.theme=source.theme;
  if(/^#[a-f\d]{6}$/i.test(source.accent)) p.accent=source.accent;
  if(Number.isFinite(source.fontSize)) p.fontSize=Math.min(20,Math.max(12,source.fontSize));
  for(const key of ['compact','reduceMotion','showMembers','sounds','desktopNotifications','notificationPreview']) if(typeof source[key]==='boolean') p[key]=source[key];
  return p;
}
let active=DEFAULT_PREFERENCES;
export const getPreferences=()=>active;
export const setActivePreferences=value=>{active=normalizePreferences(value);};
