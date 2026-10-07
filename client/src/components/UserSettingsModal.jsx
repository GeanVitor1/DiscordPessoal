import {t as translate,useLocale} from '../localization';
import AppearanceSettings from './AppearanceSettings';
import AccountSettings from './AccountSettings';
import PrivacySettings,{ProfileDetails} from './PrivacySettings';
import AudioSettings from './AudioSettings';
import DesktopSettings from './DesktopSettings';
import ProtectedImage, { useProtectedSource } from '../components/ProtectedImage';
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Upload, Image, Palette, Sparkles, RefreshCw, Download, ArrowUpCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, isElectron } from '../config';
import { useUpdates } from '../hooks/useUpdates';


export default function UserSettingsModal({ isOpen, onClose }) {
  useLocale();
  const { currentUser, updateProfile, logout } = useAuth();

  const [username, setUsername] = useState(currentUser?.username || '');
  const [customStatus, setCustomStatus] = useState(currentUser?.customStatus || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [banner, setBanner] = useState(currentUser?.banner || '');
  const [bannerColor, setBannerColor] = useState(currentUser?.bannerColor || '#5865F2');

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'updates'
  const [appVersion, setAppVersion] = useState('');
  const update = useUpdates();
  const updateCheckStatus = update.status;
  const updateInfo = update;
  const downloadProgress = update.percent || 0;

  const avatarFileRef = useRef(null);
  const bannerFileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setUsername(currentUser?.username || '');
    setCustomStatus(currentUser?.customStatus || '');
    setBio(currentUser?.bio || '');
    setAvatar(currentUser?.avatar || '');
    setBanner(currentUser?.banner || '');
    setBannerColor(currentUser?.bannerColor || '#5865F2');
    setErrorMessage('');
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }

  }, []);

  const handleManualCheckUpdates = async () => {
    setErrorMessage('');
    try { await window.electronAPI?.checkForUpdates(); }
    catch { setErrorMessage('Serviço de atualização indisponível. Tente novamente.'); }
  };
  const handleStartDownloadUpdate = async () => {
    try { await window.electronAPI?.startDownloadUpdate(); }
    catch { setErrorMessage('Serviço de atualização indisponível. Tente novamente.'); }
  };
  const handleRestartAndInstall = () => window.electronAPI?.restartAndInstallUpdate();


  const resolvedBanner=useProtectedSource(banner);
  if (!isOpen) return null;

  // Avatares animados populares (estilo Discord Nitro)
  const animatedAvatarPresets = [
    { name: 'Gato Neon', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' },
    { name: 'Pixel Hacker', url: 'https://media.giphy.com/media/LmN8OYiY4m0X85K0Zz/giphy.gif' },
    { name: 'Anime Chill', url: 'https://media.giphy.com/media/bjtM9GdxbqL5e/giphy.gif' },
    { name: 'Fogo Roxo', url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif' },
    { name: 'Cyber Glitch', url: 'https://media.giphy.com/media/ule4vhcY1xEKQ/giphy.gif' }
  ];

  // Banners animados padrão / GIFs do Discord
  const animatedBannerPresets = [
    { name: 'Neon Cyberpunk', url: 'https://media.giphy.com/media/26tn33aiTi1jkl6H6/giphy.gif' },
    { name: 'Espaço Cósmico', url: 'https://media.giphy.com/media/3o7TKTDnUxE0g2fSE8/giphy.gif' },
    { name: 'Pixel Retrô', url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif' },
    { name: 'Chuva Lo-Fi', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
    { name: 'Anime Vaporwave', url: 'https://media.giphy.com/media/xUPGcm345LTJWFION2/giphy.gif' },
    { name: 'Matrix Digital', url: 'https://media.giphy.com/media/ule4vhcY1xEKQ/giphy.gif' }
  ];

  const colorPresets = [
    '#5865F2', '#23A55A', '#F0B232', '#F23F43', '#EB459E', '#00A8FC', '#18191C', '#4F545C'
  ];

  // Upload de arquivo local (com limite estrito de 10MB)
  const handleFileUpload = async (file, type) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(`O arquivo excede o limite de 10MB! Escolha uma imagem ou GIF menor.`);
      return;
    }

    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      if (type === 'avatar') setUploadingAvatar(true);
      if (type === 'banner') setUploadingBanner(true);

      const res = await axios.post(`${API_BASE_URL}/api/upload`, formData);
      if (type === 'avatar') {
        setAvatar(res.data.url);
      } else if (type === 'banner') {
        setBanner(res.data.url);
      }
    } catch (err) {
      setErrorMessage('Falha ao enviar arquivo. Verifique o tamanho (máx 10MB).');
    } finally {
      setUploadingAvatar(false);
      setUploadingBanner(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try { await updateProfile({
      username: username.trim() || currentUser.username,
      customStatus: customStatus.trim(),
      bio: bio.trim(),
      avatar: avatar || currentUser.avatar,
      banner: banner,
      bannerColor: bannerColor
    });
    onClose(); } catch (error) { setErrorMessage(error.response?.data?.error || 'Falha ao salvar perfil'); }
  };

  return (
    <div role="dialog" aria-label={translate("Configurações de Usuário")} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-discord-chat w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-discord-active flex flex-col max-h-[90vh]">
        
        {/* Header do Modal com Seletor de Abas */}
        <div className="px-6 pt-4 border-b border-discord-sidebar bg-discord-darker">
          <div className="flex items-center justify-between pb-3">
            <button type="button" onClick={logout} className="text-red-300 text-sm">{translate("Sair da conta")}</button>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">{translate("Configurações")}</h2>
            <button
              aria-label={translate("Fechar configurações")}
              onClick={onClose}
              className="p-1 rounded-full text-discord-textMuted hover:text-white hover:bg-discord-hover transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Abas */}
          <div className="flex items-center gap-4 text-sm font-semibold overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`pb-2 border-b-2 flex items-center gap-2 transition ${
                activeTab === 'profile'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-textMuted hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-discord-blurple" />{translate("Perfil")}</button>

            {Object.entries({desktop:'Aplicativo e atalhos',audio:'Voz e vídeo',account:'Conta',privacy:'Privacidade',profileDetails:'Mais do perfil',appearance:'Aparência',notifications:'Notificações'}).map(([tab,label])=><button type="button" key={tab} onClick={()=>setActiveTab(tab)} className={`pb-2 border-b-2 ${activeTab===tab?'border-discord-blurple text-discord-textHeader':'border-transparent text-discord-textMuted'}`}>{translate(label)}</button>)}
            <button
              type="button"
              onClick={() => setActiveTab('updates')}
              className={`pb-2 border-b-2 flex items-center gap-2 transition ${
                activeTab === 'updates'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-textMuted hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4 text-discord-green" />{translate("Atualizações do App")}{updateCheckStatus === 'ready' && (
                <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />
              )}
            </button>
          </div>
        </div>


        {errorMessage && (
          <div className="bg-discord-red/20 border-b border-discord-red/30 px-6 py-2 text-xs text-discord-red font-medium">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab==='desktop'?<DesktopSettings/>:activeTab==='audio'?<AudioSettings/>:activeTab==='account'?<AccountSettings/>:activeTab==='privacy'?<PrivacySettings/>:activeTab==='profileDetails'?<ProfileDetails/>:activeTab === 'appearance' || activeTab === 'notifications' ? <AppearanceSettings notifications={activeTab==='notifications'} /> : activeTab === 'profile' ? (
            <>
              {/* Card de Pré-visualização do Perfil com Banner Mais Alto */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block">{translate("Pré-visualização do Perfil")}</span>
                <div className="bg-discord-sidebar rounded-2xl overflow-hidden border border-discord-active shadow-2xl relative">
                  {/* Banner com Altura Aumentada (h-48) */}
                  <div
                    className="h-48 w-full bg-cover bg-center relative transition-all duration-300"
                    style={{
                      backgroundColor: bannerColor,
                      backgroundImage: resolvedBanner ? `url(${resolvedBanner})` : undefined
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-[#232428] via-transparent to-black/30" />
                    <div className="absolute top-3 right-3 flex gap-1">
                      <span className="text-[11px] bg-black/60 text-white px-2.5 py-1 rounded-full backdrop-blur-md font-semibold border border-white/10 flex items-center gap-1.5 shadow">
                        <Sparkles className="w-3.5 h-3.5 text-discord-blurple" />
                        {banner ? 'Banner Animado Ativo' : 'Cor Sólida'}
                      </span>
                    </div>
                  </div>

                  {/* Avatar sobreposto ao banner */}
                  <div className="px-5 pb-5 relative -mt-16 z-20">
                    <div className="relative mb-3 inline-block">
                      <ProtectedImage
                        src={avatar || currentUser?.avatar}
                        alt="Avatar"
                        className="w-24 h-24 rounded-full border-[5px] border-discord-sidebar bg-discord-darkest object-cover shadow-2xl"
                      />
                      <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-discord-green border-[3px] border-discord-sidebar" />
                    </div>

                    <div className="bg-[#111214] p-4 rounded-xl border border-discord-darker">
                      <h3 className="text-xl font-bold text-white leading-tight">{username || 'Usuário'}</h3>
                      <p className="text-xs text-discord-textMuted mt-0.5">#{currentUser?.discriminator || 1000}</p>
                      {customStatus && (
                        <div className="text-xs text-discord-textNormal mt-2.5 bg-discord-darkest p-2 rounded-lg border border-discord-darker inline-flex items-center gap-1.5">
                          <span>💬</span>
                          <span>{customStatus}</span>
                        </div>
                      )}
                      {bio && (
                        <div className="mt-3 pt-3 border-t border-discord-darker text-xs text-discord-textMuted">
                          <p className="font-bold text-white text-[11px] uppercase tracking-wider mb-1">{translate("Sobre Mim")}</p>
                          <p className="whitespace-pre-wrap text-discord-textNormal leading-relaxed">{bio}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 1: Upload de Foto de Avatar (Imagens ou GIFs locais) */}
              <div className="bg-discord-darker p-5 rounded-xl border border-discord-active space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-discord-active">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-discord-blurple" />{translate("Foto de Perfil & Avatar Animado")}</h4>
                    <p className="text-xs text-discord-textMuted mt-0.5">{translate("Envie qualquer arquivo GIF animado ou imagem do seu computador (máx 10MB).")}</p>
                  </div>

                  <input
                    type="file"
                    ref={avatarFileRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files?.[0], 'avatar')}
                  />

                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="px-4 py-2 bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow self-start sm:self-auto shrink-0"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingAvatar ? 'Enviando...' : 'Carregar do Computador'}
                  </button>
                </div>

                {/* Presets de Avatares Animados */}
                <div>
                  <span className="text-[11px] font-bold text-discord-textMuted uppercase tracking-wider block mb-2.5">{translate("Ou escolha um avatar animado (GIF)")}</span>
                  <div className="grid grid-cols-5 gap-3">
                    {animatedAvatarPresets.map((a) => (
                      <button
                        key={a.name}
                        type="button"
                        onClick={() => setAvatar(a.url)}
                        className={`h-16 rounded-xl overflow-hidden border-2 transition group relative flex flex-col items-center justify-center bg-black/40 ${
                          avatar === a.url ? 'border-discord-blurple ring-2 ring-discord-blurple scale-105 shadow-lg' : 'border-transparent hover:border-white/40'
                        }`}
                        title={a.name}
                      >
                        <ProtectedImage src={a.url} alt={a.name} className="w-full h-full object-cover group-hover:scale-110 transition" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-[9px] text-white font-medium text-center truncate">
                          {a.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Seção 2: Banner do Perfil (Cor ou GIF animado) */}
              <div className="bg-discord-darker p-5 rounded-xl border border-discord-active space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-discord-active">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Image className="w-4 h-4 text-discord-blurple" />{translate("Banner do Perfil")}</h4>
                    <p className="text-xs text-discord-textMuted mt-0.5">{translate("Faça upload de seu banner animado favorito ou selecione uma opção abaixo.")}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="file"
                      ref={bannerFileRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files?.[0], 'banner')}
                    />
                    <button
                      type="button"
                      onClick={() => bannerFileRef.current?.click()}
                      disabled={uploadingBanner}
                      className="px-4 py-2 bg-discord-chat hover:bg-discord-active text-white text-xs font-semibold rounded-lg flex items-center gap-2 border border-discord-textMuted transition disabled:opacity-50 shadow"
                    >
                      <Upload className="w-4 h-4 text-discord-blurple" />
                      {uploadingBanner ? 'Enviando...' : 'Carregar Banner/GIF'}
                    </button>

                    {banner && (
                      <button
                        type="button"
                        onClick={() => setBanner('')}
                        className="px-3 py-2 bg-discord-red/10 hover:bg-discord-red/20 text-discord-red text-xs font-semibold rounded-lg border border-discord-red/30 transition"
                      >{translate("Remover")}</button>
                    )}
                  </div>
                </div>

                {/* Presets de Banners Animados / Temas */}
                <div>
                  <label className="text-[11px] font-bold text-discord-textMuted uppercase tracking-wider block mb-2.5">{translate("Banners Animados em Destaque (GIFs)")}</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {animatedBannerPresets.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => setBanner(b.url)}
                        className={`h-20 rounded-xl overflow-hidden relative border-2 transition group ${
                          banner === b.url ? 'border-discord-blurple ring-2 ring-discord-blurple scale-[1.02] shadow-lg' : 'border-transparent hover:border-white/40'
                        }`}
                      >
                        <ProtectedImage src={b.url} alt={b.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2">
                          <span className="text-xs font-bold text-white drop-shadow">
                            {b.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cores de Banner */}
                <div>
                  <label className="text-[11px] font-bold text-discord-textMuted uppercase tracking-wider block mb-2">{translate("Ou Cor do Banner")}</label>
                  <div className="flex items-center gap-2.5 flex-wrap bg-discord-darkest p-3 rounded-xl border border-discord-active">
                    {colorPresets.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          setBannerColor(col);
                          setBanner('');
                        }}
                        style={{ backgroundColor: col }}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${
                          bannerColor === col && !banner ? 'border-white scale-110 shadow-lg ring-2 ring-white/30' : 'border-transparent hover:scale-105'
                        }`}
                        title={col}
                      />
                    ))}
                    <div className="h-6 w-[1px] bg-discord-active mx-1" />
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-discord-textMuted hover:text-white transition">
                      <input
                        type="color"
                        value={bannerColor}
                        onChange={(e) => {
                          setBannerColor(e.target.value);
                          setBanner('');
                        }}
                        className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0"
                        title={translate("Escolher cor personalizada")}
                      />
                      <span>{translate("Personalizada")}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Seção 3: Informações de Texto (Nome, Status e Bio) */}
              <div className="bg-discord-darker p-5 rounded-xl border border-discord-active space-y-4">
                <div>
                  <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-1.5">{translate("Nome de Exibição")}</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-discord-darkest text-white px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple border border-discord-active transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-1.5">{translate("Status Personalizado")}</label>
                  <input
                    type="text"
                    placeholder={translate("Ex: Jogando Valorant / Ouvindo Spotify")}
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    className="w-full bg-discord-darkest text-white px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple border border-discord-active transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-1.5">{translate("Sobre Mim (Biografia)")}</label>
                  <textarea
                    rows={3}
                    placeholder={translate("Conte um pouco sobre você...")}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-discord-darkest text-white px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple border border-discord-active resize-none transition"
                  />
                </div>
              </div>
            </>
          ) : (
            /* ABA DE ATUALIZAÇÕES DO APLICATIVO */
            <div className="space-y-6">
              <div className="bg-discord-darker p-6 rounded-2xl border border-discord-active shadow-lg">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-discord-blurple/20 flex items-center justify-center text-discord-blurple">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">MeuApp Desktop</h3>
                    <p className="text-xs text-discord-textMuted">{translate("Versão instalada:")}<strong className="text-discord-green font-mono">v{appVersion}</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{translate("Verificação automática ao abrir e a cada 15 minutos. Download em segundo plano e instalação ao fechar.")}</p>
                  </div>
                </div>

                {/* Status da checagem */}
                <div className="bg-discord-darkest p-4 rounded-xl border border-discord-active mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">{translate("Estado do Sistema:")}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-discord-blurple">
                      {updateCheckStatus === 'checking' && 'Verificando atualizações...'}
                      {updateCheckStatus === 'available' && 'Nova versão encontrada!'}
                      {updateCheckStatus === 'downloading' && `Baixando atualização (${downloadProgress}%)`}
                      {updateCheckStatus === 'ready' && 'Pronto para instalar!'}
                      {updateCheckStatus === 'up-to-date' && 'Você está na versão mais recente'}
                      {updateCheckStatus === 'error' && 'Falha ao buscar'}
                      {updateCheckStatus === 'idle' && 'Aguardando verificação'}
                      {updateCheckStatus === 'no-release' && 'Nenhuma atualização publicada'}
                      {updateCheckStatus === 'disabled' && 'Disponível no aplicativo instalado'}
                    </span>
                  </div>

                  {update.error && <p role="alert" className="mt-3 text-sm text-discord-textMuted">{update.error}</p>}

                  {updateCheckStatus === 'downloading' && (
                    <div className="mt-3">
                      <div className="w-full bg-discord-darker rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-discord-blurple h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 text-right">{downloadProgress}{translate("% concluído")}</p>
                    </div>
                  )}

                  {updateCheckStatus === 'ready' && (
                    <div className="mt-3 bg-discord-green/10 border border-discord-green/30 p-3 rounded-lg flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-discord-green shrink-0" />
                      <div className="text-xs text-gray-200">{translate("A atualização")}<strong className="text-discord-green">v{updateInfo?.version || ''}</strong>{translate("será instalada quando você fechar o aplicativo. Você também pode reiniciar agora.")}</div>
                    </div>
                  )}

                  {updateCheckStatus === 'available' && (
                    <div className="mt-3 bg-discord-blurple/10 border border-discord-blurple/30 p-3 rounded-lg flex items-center gap-3">
                      <ArrowUpCircle className="w-5 h-5 text-discord-blurple shrink-0" />
                      <div className="text-xs text-gray-200">{translate("Nova versão disponível:")}<strong className="text-discord-blurple">v{updateInfo?.version || ''}</strong>{translate(". O download inicia automaticamente ou você pode acioná-lo abaixo.")}</div>
                    </div>
                  )}

                  {updateCheckStatus === 'up-to-date' && (
                    <div className="mt-3 bg-discord-green/10 border border-discord-green/30 p-3 rounded-lg flex items-center gap-3">
                      <Check className="w-5 h-5 text-discord-green shrink-0" />
                      <div className="text-xs text-gray-200">{translate("Seu aplicativo está totalmente atualizado (v")}{appVersion}{translate("). Nenhuma ação necessária!")}</div>
                    </div>
                  )}
                </div>

                {/* Botões de Ação na Aba de Atualizações */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={updateCheckStatus === 'checking' || updateCheckStatus === 'downloading'}
                    onClick={handleManualCheckUpdates}
                    className="px-5 py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-bold rounded-lg flex items-center gap-2 transition shadow disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${updateCheckStatus === 'checking' ? 'animate-spin' : ''}`} />
                    {updateCheckStatus === 'checking' ? 'Buscando...' : 'Verificar Atualizações Agora'}
                  </button>

                  {updateCheckStatus === 'available' && (
                    <button
                      type="button"
                      onClick={handleStartDownloadUpdate}
                      className="px-5 py-2.5 bg-discord-green hover:bg-green-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition shadow"
                    >
                      <Download className="w-4 h-4" />{translate("Baixar Atualização Agora")}</button>
                  )}

                  {updateCheckStatus === 'ready' && (
                    <button
                      type="button"
                      onClick={handleRestartAndInstall}
                      className="px-5 py-2.5 bg-discord-green hover:bg-green-600 text-white text-xs font-extrabold uppercase tracking-wide rounded-lg flex items-center gap-2 transition shadow animate-bounce"
                    >
                      <CheckCircle className="w-4 h-4" />{translate("Reiniciar e Atualizar Aplicativo")}</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-discord-darker border-t border-discord-sidebar flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm text-discord-textNormal hover:underline font-medium"
          >
            {activeTab === 'profile' ? translate("Cancelar") : translate("Fechar")}
          </button>
          {activeTab === 'profile' && (
            <button
              onClick={handleSave}
              type="button"
              className="px-7 py-2.5 text-sm bg-discord-blurple hover:bg-discord-blurple-hover text-white rounded-lg font-semibold flex items-center gap-2 shadow-lg transition"
            >
              <Check className="w-4 h-4" />{translate("Salvar Alterações")}</button>
          )}
        </div>

      </div>
    </div>
  );
}
