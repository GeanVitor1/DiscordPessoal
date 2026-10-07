import {useSyncExternalStore} from 'react';
import {ENGLISH} from './locales/en';
let language='pt-BR';const listeners=new Set();
export function setLocale(next){if(language===next)return;language=next;for(const listener of listeners)listener();}
export function useLocale(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},()=>language);}
export function t(value){return language==='en' && typeof value==='string'?(ENGLISH[value]??value):value;}
