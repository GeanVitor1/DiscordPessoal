import React from 'react';
import {usePreferences} from '../context/PreferencesContext';
import {THEMES} from '../preferences';
export default function AppearanceSettings({notifications=false}) {
  const {preferences:p,update,reset}=usePreferences();
  const toggle=(key,label,detail)=><label className="flex items-center gap-4 py-4 border-b border-discord-active"><span className="flex-1"><b className="text-discord-textHeader block text-sm">{label}</b><span className="text-discord-textMuted text-xs">{detail}</span></span><input type="checkbox" checked={p[key]} onChange={e=>update({[key]:e.target.checked})} aria-label={label} className="w-5 h-5 accent-discord-blurple"/></label>;
  return <div className="space-y-5"><h3 className="text-lg font-bold text-discord-textHeader">{notifications?'Notificações e sons':'Aparência e acessibilidade'}</h3><p className="text-xs text-discord-textMuted">As preferências são aplicadas imediatamente e salvas para esta conta neste dispositivo.</p>{notifications?<>
    {toggle('sounds','Sons do aplicativo','Mensagens e controles de chamada.')}
    {toggle('desktopNotifications','Notificações no desktop','Mensagens, amizade e convites. Não perturbe silencia os avisos.')}
    {toggle('notificationPreview','Mostrar prévia nas notificações','Desative para ocultar o conteúdo das mensagens nas notificações.')}
  </>:<>
    <fieldset><legend className="text-sm font-semibold mb-3">Tema</legend><div className="grid grid-cols-3 gap-3">{THEMES.map(t=><button type="button" key={t.id} style={{color:t.id==='light'?'#17191d':t.id==='system'?'var(--accent)':'#eeeeee'}} aria-pressed={p.theme===t.id} onClick={()=>update({theme:t.id})} className={`theme-choice theme-preview-${t.id} p-4 rounded-xl border-2 text-sm font-semibold ${p.theme===t.id?'border-discord-blurple':'border-discord-active'}`}><div className="flex gap-1 mb-3"><span className="w-3 h-3 rounded-full bg-discord-blurple"/><span className="h-3 rounded bg-current opacity-30 flex-1"/></div>{t.name}</button>)}</div></fieldset>
    <label className="flex items-center gap-4 text-sm font-semibold">Cor de destaque<input type="color" aria-label="Cor de destaque" value={p.accent} onChange={e=>update({accent:e.target.value})} className="w-12 h-9 bg-transparent"/></label>
    <label className="block text-sm">Tamanho do texto: <b>{p.fontSize}px</b><input type="range" aria-label="Tamanho do texto" min="12" max="20" value={p.fontSize} onChange={e=>update({fontSize:Number(e.target.value)})} className="w-full mt-3 accent-discord-blurple"/></label>
    <div className="bg-discord-darker rounded-xl p-4"><b className="text-discord-textHeader text-sm">Prévia da conversa</b><p className="message-content mt-2">Olá! Seu próximo encontro com os amigos começa aqui. ✨</p></div>
    {toggle('compact','Mensagens compactas','Reduza o espaço entre mensagens nos canais e nas conversas privadas.')}
    {toggle('reduceMotion','Reduzir movimento','Desative animações da interface e rolagem animada.')}
    {toggle('showMembers','Mostrar lista de membros','Exiba a barra de membros à direita dos canais de texto.')}
  </>}<button type="button" onClick={reset} className="text-sm text-discord-blurple underline">Restaurar preferências padrão</button></div>;
}
