import React,{createContext,useContext,useEffect,useState} from 'react';
import {useAuth} from './AuthContext';
import {API_BASE_URL} from '../config';
import {DEFAULT_PREFERENCES,normalizePreferences,setActivePreferences} from '../preferences';
import {setLocale} from '../localization';
const Context=createContext();
export function PreferencesProvider({children}) {
  const {currentUser}=useAuth();
  const key=`meuapp.preferences:${API_BASE_URL}:${currentUser?.id || 'guest'}`;
  const [state,setState]=useState({key,value:DEFAULT_PREFERENCES});
  const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
  const preferences=state.key===key?state.value:DEFAULT_PREFERENCES;
  useEffect(()=>{let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}setState({key,value:normalizePreferences(saved)});},[key]);
  useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)'),changed=e=>setSystemDark(e.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
  useEffect(()=>{
    const root=document.documentElement;root.dataset.theme=preferences.theme==='system'?(systemDark?'dark':'light'):preferences.theme;
    root.dataset.compact=String(preferences.compact);root.dataset.reduceMotion=String(preferences.reduceMotion);
    root.dataset.highContrast=String(preferences.highContrast);root.dataset.showAvatars=String(preferences.showAvatars);root.style.zoom=String(preferences.zoom*preferences.uiScale);root.lang=preferences.language;
    root.style.setProperty('--accent',preferences.accent);root.style.setProperty('--chat-font-size',`${preferences.fontSize}px`);
    setActivePreferences(preferences);
    setLocale(preferences.language);
  },[preferences,systemDark]);
  const update=patch=>setState(previous=>{const value=normalizePreferences({...(previous.key===key?previous.value:DEFAULT_PREFERENCES),...patch});try{localStorage.setItem(key,JSON.stringify(value));}catch{}return {key,value};});
  return <Context.Provider value={{preferences,update,reset:()=>update(DEFAULT_PREFERENCES)}}>{children}</Context.Provider>;
}
export const usePreferences=()=>useContext(Context);
