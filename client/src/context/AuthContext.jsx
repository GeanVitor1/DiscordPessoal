import React, { createContext,useContext,useState,useEffect } from 'react';
import api,{setAccessToken} from '../api';
import { API_BASE_URL } from '../config';
import { probeServer } from '../connection';
const AuthContext=createContext();
const storageKey='auth_session:'+API_BASE_URL;
const vault=window.electronAPI?.auth;
async function readToken() {if(!API_BASE_URL)return null;return vault?await vault.getToken(API_BASE_URL):sessionStorage.getItem(storageKey);}
async function saveToken(token) {if(!API_BASE_URL)return;if(vault) await vault.saveToken(API_BASE_URL,token);else if(token) sessionStorage.setItem(storageKey,token);else sessionStorage.removeItem(storageKey);}
export function AuthProvider({children}) {
 const [currentUser,setCurrentUser]=useState(null),[loading,setLoading]=useState(true);
 const [connection,setConnection]=useState({status:'connecting'}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let alive=true,timer;
  const controller=new AbortController();
  async function connect() {
   const health=await probeServer(API_BASE_URL,{signal:controller.signal});
   if(!alive)return;
   if(health.status==='ready') {
    try {
     const token=await readToken();if(!alive)return;setAccessToken(token);
     if(token){const {data}=await api.get('/api/auth/me',{signal:controller.signal});if(!alive)return;setCurrentUser(data);}
    }catch(error){
     if(!alive)return;setAccessToken(null);
     // Only a revoked session invalidates persisted credentials, never an outage.
     if(error.response?.status===401)await saveToken(null).catch(()=>{});
     else health.status='offline';
    }
   }
   if(!alive)return;setConnection(health);setLoading(false);
   if(health.status!=='ready')timer=setTimeout(connect,health.status==='incompatible'?30000:5000);
  }
  setConnection({status:'connecting'});connect();
  const online=()=>setAttempt(value=>value+1);window.addEventListener('online',online);
  return()=>{alive=false;controller.abort();clearTimeout(timer);window.removeEventListener('online',online);};
 },[attempt]);
 useEffect(()=>{
  const expired=()=>{setCurrentUser(null);setAccessToken(null);saveToken(null).catch(()=>{});};
  window.addEventListener('auth-expired',expired);
  return()=>{window.removeEventListener('auth-expired',expired);};
 },[]);
 async function authenticate(action,credentials) {const {data}=await api.post('/api/auth/'+action,credentials);await saveToken(data.token);setAccessToken(data.token);setCurrentUser(data.user);return data.user;}
 async function updateProfile(fields) {const {data}=await api.post('/api/users/sync',{...fields,banner_color:fields.bannerColor,custom_status:fields.customStatus});setCurrentUser(data);return data;}
 async function logout() {try{await api.delete('/api/auth/session');}finally{await saveToken(null);setAccessToken(null);setCurrentUser(null);}}
 return <AuthContext.Provider value={{currentUser,loading,connection,retryConnection:()=>setAttempt(value=>value+1),login:c=>authenticate('login',c),register:c=>authenticate('register',c),updateProfile,updateStatus:status=>updateProfile({status}),logout}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
