import React,{createContext,useContext,useState,useEffect} from 'react';
import {useAuth} from './AuthContext';
import {API_BASE_URL} from '../config';
import {DEFAULT_AUDIO,normalizeAudio} from '../audio-settings';
const Context=createContext();
export function AudioPreferencesProvider({children}){const{currentUser}=useAuth(),key=`audio:${API_BASE_URL}:${currentUser?.id || 'guest'}`;const[state,setState]=useState({key,value:DEFAULT_AUDIO});const settings=state.key===key?state.value:DEFAULT_AUDIO;useEffect(()=>{let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}setState({key,value:normalizeAudio(saved)});},[key]);const update=patch=>setState(old=>{const previous=old.key===key?old.value:DEFAULT_AUDIO;const value=normalizeAudio({...previous,...(typeof patch==='function'?patch(previous):patch)});localStorage.setItem(key,JSON.stringify(value));return{key,value};});const participant=(id,patch)=>update(previous=>({participants:{...previous.participants,[id]:{volume:1,muted:false,hideVideo:false,prioritizeStream:false,...previous.participants[id],...patch}}}));return <Context.Provider value={{settings,update,participant,reset:()=>update(DEFAULT_AUDIO)}}>{children}</Context.Provider>;}
export const useAudioPreferences=()=>useContext(Context);
