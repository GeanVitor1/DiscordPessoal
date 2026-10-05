import React,{useState} from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { serverOrigin } from '../connection';
export default function LoginScreen() {
  const {login,register,connection,retryConnection}=useAuth();
  const [creating,setCreating]=useState(false),[handle,setHandle]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState('');
  const [server,setServer]=useState(API_BASE_URL),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e) {
    e.preventDefault();setError('');setBusy(true);
    try {await (creating?register:login)({handle,password,username});}
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
  return <main className="h-screen bg-discord-darkest text-discord-textNormal flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-discord-chat p-8 shadow-xl space-y-4">
      <div className="text-center"><div className="text-3xl font-bold text-white">MeuApp</div><h1 className="text-xl mt-3">{creating?'Crie sua conta':'Bem-vindo de volta'}</h1><p className="text-sm text-discord-textMuted mt-1">Conversas, chamadas e assistência em um só lugar.</p></div>
      <div role="status" data-testid="connection-status" className="text-sm rounded-lg bg-discord-sidebar p-3">
        {connection.status==='connecting' && 'Conectando automaticamente…'}
        {connection.status==='ready' && 'Conectado. Entre na sua conta.'}
        {connection.status==='offline' && 'Serviço indisponível no momento. Tentando reconectar automaticamente…'}
        {connection.status==='incompatible' && 'O serviço online precisa ser atualizado. A conexão será retomada automaticamente quando ele estiver pronto.'}
        {['offline','incompatible'].includes(connection.status) && <button type="button" onClick={retryConnection} className="block mt-2 text-[#00a8fc]">Tentar agora</button>}
      </div>
      <label className="block text-xs font-bold">USUÁRIO<input data-testid="auth-handle" required minLength={3} maxLength={32} autoComplete="username" value={handle} onChange={e=>setHandle(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>
      {creating && <label className="block text-xs font-bold">NOME DE EXIBIÇÃO<input value={username} maxLength={32} onChange={e=>setUsername(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>}
      <label className="block text-xs font-bold">SENHA<input data-testid="auth-password" required type="password" minLength={12} maxLength={256} autoComplete={creating?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} className="block mt-2 w-full p-3 rounded bg-discord-darkest text-base" /></label>
      <p className="text-xs text-discord-textMuted">Use pelo menos 12 caracteres.</p>
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      <button data-testid="auth-submit" disabled={busy || connection.status!=='ready'} className="w-full bg-discord-blurple py-3 rounded font-semibold disabled:opacity-50">{busy?'Conectando…':creating?'Criar conta':'Entrar'}</button>
      <button data-testid="auth-mode" type="button" onClick={()=>{setCreating(!creating);setError('');}} className="text-[#00a8fc] text-sm">{creating?'Já tenho uma conta':'Criar uma conta'}</button>
      <details className="text-sm border-t border-white/10 pt-4"><summary className="cursor-pointer">Opções avançadas</summary><input aria-label="URL do backend" value={server} onChange={e=>setServer(e.target.value)} className="w-full bg-discord-darkest p-2 rounded mt-3" /><button type="button" onClick={changeServer} className="mt-2 text-[#00a8fc]">Usar servidor personalizado</button><button type="button" onClick={()=>{localStorage.removeItem('backend_mode');window.location.reload();}} className="block mt-2 text-[#00a8fc]">Restaurar conexão automática</button><p className="text-xs mt-2 text-discord-textMuted">A conexão automática já vem configurada. Contas de um servidor personalizado pertencem somente a ele.</p></details>
    </form>
  </main>;
}
