import axios from 'axios';
import { API_BASE_URL } from './config';
let token = null;
export const getAccessToken = () => token;
export const setAccessToken = value => { token=value; };
const api=axios.create({baseURL:API_BASE_URL,timeout:15000});
api.interceptors.request.use(config=>{
  const target=new URL(config.url,API_BASE_URL || window.location.origin);
  const origin=new URL(API_BASE_URL || window.location.origin).origin;
  if(target.origin!==origin) throw new Error('A API não envia credenciais para outro servidor');
  if(token) config.headers.Authorization=`Bearer ${token}`;
  return config;
});
api.interceptors.response.use(r=>r,error=>{
  if(error.response?.status===401 && !error.config.url.includes('/auth/login')) window.dispatchEvent(new Event('auth-expired'));
  return Promise.reject(error);
});
export default api;
