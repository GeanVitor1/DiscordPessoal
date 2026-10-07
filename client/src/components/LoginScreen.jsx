import {t as translate,useLocale} from '../localization';
import React,{useState} from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { serverOrigin } from '../connection';
import {AccountRecovery} from './AccountSettings';
export default function LoginScreen() {
  useLocale();
  const {login,register,connection,retryConnection}=useAuth();
  const [creating,setCreating]=useState(false),[handle,setHandle]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState('');
  const [server,setServer]=useState(API_BASE_URL),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [recover,setRecover]=useState(new URLSearchParams(window.location.search).has('accountAction')),[code,setCode]=useState(''),[reactivate,setReactivate]=useState(false);
  async function submit(e) {
    e.preventDefault();setError('');setBusy(true);
    try {await (creating?register:login)({handle,password,username,code,reactivate});}
    catch(e){setError(e.response?.data?.error || 'Não foi possível conectar ao servidor');}
    finally{setBusy(false);}
  }
  function changeServer() {
    try {
      const origin=serverOrigin(server);
      if(!origin) throw Error();
      localStorage.setItem('backend_mode','custom');localStorage.setItem('backend_url',origin);window.location.reload();
    }catch{setError('Use HTTPS ou HTTP em localhost, sem caminho nem credenciais.');}
  }
  if(recover)return <main className="h-screen overflow-auto bg-discord-darkest flex items-center justify-center p-6"><AccountRecovery onClose={()=>{setRecover(false);window.history.replaceState(null,'',window.location.pathname);}}/></main>;
  return <main className="h-screen overflow-auto bg-discord-darkest text-discord-textNormal flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-discord-chat p-8 shadow-xl space-y-4">
      <div className="text-center"><div className="text-3xl font-bold text-white">MeuApp</div><h1 className="text-xl mt-3">{creating?'Crie sua conta':'Bem-vindo de volta'}</h1><p className="text-sm text-discord-textMuted mt-1">{translate("Conversas, chamadas e assistência em um só lugar.")}</p></div>
      <div role="status" data-testid="connection-status" className="text-sm rounded-lg bg-discord-sidebar p-3">
        {connection.status==='connecting' && 'Conectando automaticamente…'}
        {connection.status==='ready' && 'Conectado. Entre na sua conta.'}
        {connection.status==='offline' && 'Serviço indisponível no momento. Tentando reconectar automaticamente…'}
        {connection.status==='incompatible' && 'O serviço online precisa ser atualizado. A conexão será retomada automaticamente quando ele estiver pronto.'}
        {['offline','incompatible'].includes(connection.status) && <button type="button" onClick={retryConnection} className="block mt-2 text-[#00a8fc]">{translate("Tentar agora")}</button>}
      </div>
      <label className="block text-xs font-bold">{translate("USUÁRIO")}<input data-testid="auth-handle" required minLength={3} maxLength={32} autoComplete="username" value={handle} onChange={e=>setHandle(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>
      {creating && <label className="block text-xs font-bold">{translate("NOME DE EXIBIÇÃO")}<input value={username} maxLength={32} onChange={e=>setUsername(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>}
      <label className="block text-xs font-bold">{translate("SENHA")}<input data-testid="auth-password" required type="password" minLength={12} maxLength={256} autoComplete={creating?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>
      <p className="text-xs text-discord-textMuted">{translate("Use pelo menos 12 caracteres.")}</p>
      {!creating&&<details><summary className="text-sm cursor-pointer">{translate("Autenticador ou conta desativada")}</summary><label className="block text-sm mt-2">{translate("Código de autenticação ou recuperação")}<input value={code} onChange={e=>setCode(e.target.value)} className="block w-full p-3 rounded bg-discord-darkest mt-2" autoComplete="one-time-code"/></label><label className="flex gap-2 items-center text-sm mt-2"><input type="checkbox" checked={reactivate} onChange={e=>setReactivate(e.target.checked)}/>{translate("Reativar conta desativada")}</label></details>}
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      <button data-testid="auth-submit" disabled={busy || connection.status!=='ready'} className="w-full bg-discord-blurple py-3 rounded font-semibold disabled:opacity-50">{busy?translate("Conectando…"):creating?'Criar conta':translate("Entrar")}</button>
      <button data-testid="auth-mode" type="button" onClick={()=>{setCreating(!creating);setError('');}} className="text-[#00a8fc] text-sm">{creating?'Já tenho uma conta':'Criar uma conta'}</button>
      <button type="button" onClick={()=>setRecover(true)} className="block text-discord-blurple text-sm">{translate("Esqueci minha senha / Confirmar e-mail")}</button>
      <details className="text-sm border-t border-white/10 pt-4"><summary className="cursor-pointer">{translate("Opções avançadas")}</summary><input aria-label={translate("URL do backend")} value={server} onChange={e=>setServer(e.target.value)} className="w-full bg-discord-darkest p-2 rounded mt-3" /><button type="button" onClick={changeServer} className="mt-2 text-[#00a8fc]">{translate("Usar servidor personalizado")}</button><button type="button" onClick={()=>{localStorage.removeItem('backend_mode');window.location.reload();}} className="block mt-2 text-[#00a8fc]">{translate("Restaurar conexão automática")}</button><p className="text-xs mt-2 text-discord-textMuted">{translate("A conexão automática já vem configurada. Contas de um servidor personalizado pertencem somente a ele.")}</p></details>
    </form>
  </main>;
}
