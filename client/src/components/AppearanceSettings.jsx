import {t as translate,useLocale} from '../localization';
import React from 'react';
import {usePreferences} from '../context/PreferencesContext';
import {THEMES,SOUND_EVENTS} from '../preferences';
import {playSound} from '../utils/sounds';
export default function AppearanceSettings({notifications=false}) {
  useLocale();
  const {preferences:p,update,reset}=usePreferences();
  const toggle=(key,label,detail)=><label className="flex items-center gap-4 py-4 border-b border-discord-active"><span className="flex-1"><b className="text-discord-textHeader block text-sm">{translate(label)}</b><span className="text-discord-textMuted text-xs">{translate(detail)}</span></span><input type="checkbox" checked={p[key]} onChange={e=>update({[key]:e.target.checked})} aria-label={translate(label)} className="w-5 h-5 accent-discord-blurple"/></label>;
  return <div className="space-y-5"><h3 className="text-lg font-bold text-discord-textHeader">{notifications?translate("Notificações e sons"):translate("Aparência e acessibilidade")}</h3><p className="text-xs text-discord-textMuted">{translate("As preferências são aplicadas imediatamente e salvas para esta conta neste dispositivo.")}</p>{notifications?<>
    {toggle('sounds','Sons do aplicativo','Mensagens e controles de chamada.')}
    {toggle('desktopNotifications','Notificações no desktop','Mensagens, amizade e convites. Não perturbe silencia os avisos.')}
    {toggle('notificationPreview','Mostrar prévia nas notificações','Desative para ocultar o conteúdo das mensagens nas notificações.')}
    <label className="block text-sm">{translate("Volume dos efeitos:")} {Math.round(p.effectVolume*100)}%<input type="range" min="0" max="1" step="0.05" value={p.effectVolume} onChange={e=>update({effectVolume:Number(e.target.value)})} className="block w-full mt-2"/></label><fieldset><legend className="font-semibold mb-3">{translate("Sons por evento")}</legend>{SOUND_EVENTS.map(type=><div key={type} className="flex gap-3 items-center py-2"><label className="flex-1 text-sm flex gap-3"><input type="checkbox" checked={p.soundEvents[type]} onChange={e=>update({soundEvents:{...p.soundEvents,[type]:e.target.checked}})}/>{translate(({self_join:'Entrar em canal',message:'Nova mensagem',mention:'Menção',join:'Pessoa entrando / entrar em canal',leave:'Pessoa saindo / sair de canal',moved:'Pessoa movida',mute:'Microfone silenciado',unmute:'Microfone ativado',deafen:'Áudio silenciado',undeafen:'Áudio ativado',call_incoming:'Chamada recebida',call_outgoing:'Chamada efetuada',disconnect:'Desconectar',screenshare_on:'Compartilhamento iniciado',screenshare_off:'Compartilhamento encerrado',stream_join:'Espectador entrou',stream_leave:'Espectador saiu',camera_on:'Câmera ligada',camera_off:'Câmera desligada'})[type])}</label><button type="button" onClick={()=>playSound(type)} className="text-discord-blurple text-sm">{translate("Testar")}</button></div>)}</fieldset>
  </>:<>
    <fieldset><legend className="text-sm font-semibold mb-3">{translate("Tema")}</legend><div className="grid grid-cols-3 gap-3">{THEMES.map(t=><button type="button" key={t.id} style={{color:t.id==='light'?'#17191d':t.id==='system'?'var(--accent)':'#eeeeee'}} aria-pressed={p.theme===t.id} onClick={()=>update({theme:t.id})} className={`theme-choice theme-preview-${t.id} p-4 rounded-xl border-2 text-sm font-semibold ${p.theme===t.id?'border-discord-blurple':'border-discord-active'}`}><div className="flex gap-1 mb-3"><span className="w-3 h-3 rounded-full bg-discord-blurple"/><span className="h-3 rounded bg-current opacity-30 flex-1"/></div>{t.name}</button>)}</div></fieldset>
    <label className="flex items-center gap-4 text-sm font-semibold">{translate("Cor de destaque")}<input type="color" aria-label={translate("Cor de destaque")} value={p.accent} onChange={e=>update({accent:e.target.value})} className="w-12 h-9 bg-transparent"/></label>
    <label className="block text-sm">{translate("Tamanho do texto:")} <b>{p.fontSize}px</b><input type="range" aria-label={translate("Tamanho do texto")} min="12" max="20" value={p.fontSize} onChange={e=>update({fontSize:Number(e.target.value)})} className="w-full mt-3 accent-discord-blurple"/></label>
    <div className="bg-discord-darker rounded-xl p-4"><b className="text-discord-textHeader text-sm">{translate("Prévia da conversa")}</b><p className="message-content mt-2">{translate("Olá! Seu próximo encontro com os amigos começa aqui. ✨")}</p></div>
    {toggle('compact','Mensagens compactas','Reduza o espaço entre mensagens nos canais e nas conversas privadas.')}
    {toggle('reduceMotion','Reduzir movimento','Desative animações da interface e rolagem animada.')}
    {toggle('showMembers','Mostrar lista de membros','Exiba a barra de membros à direita dos canais de texto.')}
    {toggle('showAvatars','Mostrar avatares nas mensagens','Exiba fotos ao lado das mensagens.')}
    {toggle('linkPreviews','Mostrar prévias de links','Exiba título e descrição de links HTTPS.')}
    {toggle('showGifs','Mostrar GIFs automaticamente','Permita a exibição automática de imagens GIF.')}
    {toggle('autoPlayGifs','Reproduzir GIFs automaticamente','Desative para abrir cada GIF manualmente.')}
    {toggle('highContrast','Alto contraste','Aumente o contraste de textos e contornos de foco.')}
    <label className="block text-sm">{translate("Zoom:")} {Math.round(p.zoom*100)}%<input type="range" min="0.75" max="1.5" step="0.05" aria-label={translate("Zoom")} value={p.zoom} onChange={e=>update({zoom:Number(e.target.value)})} className="w-full block mt-2"/></label>
    <label className="block text-sm">{translate("Escala da interface:")} {Math.round(p.uiScale*100)}%<input type="range" min="0.75" max="1.5" step="0.05" aria-label={translate("Escala da interface")} value={p.uiScale} onChange={e=>update({uiScale:Number(e.target.value)})} className="w-full block mt-2"/></label>
  </>}<button type="button" onClick={reset} className="text-sm text-discord-blurple underline">{translate("Restaurar preferências padrão")}</button></div>;
}
