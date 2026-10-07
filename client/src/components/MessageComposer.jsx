import {t as translate,useLocale} from '../localization';
import React,{useEffect,useRef,useState,forwardRef} from 'react';
import api from '../api';
const MessageComposer=forwardRef(function MessageComposer({kind,id,value,onChange,onSubmit,onEscape,...props},ref){
  useLocale();
 const[choices,setChoices]=useState([]),[query,setQuery]=useState(null),[selected,setSelected]=useState(0),caret=useRef(0);
 useEffect(()=>{let alive=true;api.get(`/api/conversation/${kind}/${id}/mentions`).then(r=>{if(alive)setChoices(r.data);}).catch(()=>setChoices([]));return()=>{alive=false;};},[kind,id]);
 const candidates=query?choices.filter(c=>c.trigger===query.trigger && c.label.toLowerCase().includes(query.text.toLowerCase())).slice(0,8):[];
 function changed(e){caret.current=e.target.selectionStart;const match=e.target.value.slice(0,caret.current).match(/(?:^|\s)([@#])([\w.-]*)$/);setQuery(match?{trigger:match[1],text:match[2],start:caret.current-match[2].length-1}:null);setSelected(0);onChange(e);}
 function choose(c){const text=value.slice(0,query.start)+c.value+' '+value.slice(caret.current);onChange({target:{value:text}});setQuery(null);requestAnimationFrame(()=>{const el=ref?.current;if(el){el.focus();el.selectionStart=el.selectionEnd=query.start+c.value.length+1;}});}
 return <div className="flex-1 min-w-0 relative">{candidates.length>0&&<div role="listbox" aria-label={translate("Sugestões de menção")} className="absolute bottom-full mb-2 left-0 right-0 z-30 rounded bg-discord-darker p-2 shadow-xl">{candidates.map((c,i)=><button key={c.value} type="button" role="option" aria-selected={i===selected} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(c)} className={`block w-full text-left p-2 rounded ${i===selected?'bg-discord-active':''}`}>{c.trigger}{c.label}</button>)}</div>}<textarea {...props} ref={ref} rows={1} value={value} onChange={changed} onKeyDown={e=>{if(candidates.length && ['ArrowUp','ArrowDown','Enter','Tab'].includes(e.key)){e.preventDefault();if(e.key==='ArrowUp')setSelected(i=>(i+candidates.length-1)%candidates.length);else if(e.key==='ArrowDown')setSelected(i=>(i+1)%candidates.length);else choose(candidates[selected]);return;}if(e.key==='Escape'){setQuery(null);onEscape?.();}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSubmit(e);}}} className="w-full resize-y max-h-40 bg-transparent text-discord-textHeader placeholder-discord-textMuted text-sm outline-none"/></div>;
});
export default MessageComposer;
