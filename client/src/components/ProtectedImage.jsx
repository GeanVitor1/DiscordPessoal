import React,{useEffect,useState} from 'react';
import api from '../api';
import { API_BASE_URL } from '../config';
export async function downloadAttachment(url,filename) {
  const path=url.startsWith(API_BASE_URL+'/uploads/')?url.slice(API_BASE_URL.length):url;
  const {data}=await api.get(path,{responseType:'blob'});
  const link=document.createElement('a');link.href=URL.createObjectURL(data);link.download=filename || 'arquivo';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
export function useProtectedSource(src) {
  const [resolved,setResolved]=useState('');
  const privatePath=typeof src==='string' && (src.startsWith('/uploads/')?src:API_BASE_URL && src.startsWith(API_BASE_URL+'/uploads/')?src.slice(API_BASE_URL.length):null);
  useEffect(()=>{
    let alive=true,objectUrl=null;setResolved('');
    if(privatePath) api.get(privatePath,{responseType:'blob'}).then(({data})=>{objectUrl=URL.createObjectURL(data);if(alive)setResolved(objectUrl);else URL.revokeObjectURL(objectUrl);}).catch(()=>{});
    return()=>{alive=false;if(objectUrl) URL.revokeObjectURL(objectUrl);};
  },[privatePath]);
  return privatePath?resolved || undefined:src || undefined;
}
export default function ProtectedImage({src,...props}) {
  const resolved=useProtectedSource(src);
  const first=Array.from(String(props.alt || 'M'))[0];
  const point=first.codePointAt(0);
  const letter=(point>=0xd800 && point<=0xdfff?'M':first).toUpperCase().replace(/[<>&"']/g,'');
  const fallback='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#5865f2"/><text x="48" y="62" text-anchor="middle" font-size="42" font-family="Arial" fill="white">${letter}</text></svg>`);
  return <img {...props} src={resolved || fallback} onError={event=>{if(event.currentTarget.src!==fallback)event.currentTarget.src=fallback;}} />;
}
