import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Send,
  PlusCircle,
  Smile,
  Paperclip,
  X,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { playSound } from '../utils/sounds';
import { API_BASE_URL } from '../config';

export default function ChatArea({ server, channel, onOpenProfile }) {
  const { currentUser } = useAuth();
  const { socket, typingUsers } = useSocket();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pickerRef = useRef(null);

  // Categorias de Emojis do Discord
  const emojiCategories = [
    {
      category: 'Populares',
      items: ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '👀', '💯', '✨', '💀', '🤖', '🎮', '🍕']
    },
    {
      category: 'Expressões',
      items: ['😎', '😍', '🥳', '🤔', '😭', '🤯', '😴', '🙄', '🥺', '🤐', '😇', '😈', '🤡', '👻']
    },
    {
      category: 'Gestos & Ícones',
      items: ['👋', '🙌', '🤝', '✌️', '💪', '🎯', '⚡', '⭐', '🌈', '💎', '🛡️', '⚔️', '🎵', '🕹️']
    }
  ];

  // Fecha o seletor ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carrega histórico de mensagens do canal atual
  useEffect(() => {
    if (!channel || channel.type !== 'text') return;

    axios.get(`${API_BASE_URL}/api/channels/${channel.id}/messages`)
      .then((res) => {
        setMessages(res.data);
      })
      .catch((err) => {
        console.error('Erro ao carregar mensagens:', err);
      });
  }, [channel]);

  // Escuta novas mensagens em tempo real com som
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMsg) => {
      if (newMsg.channelId === channel?.id) {
        setMessages((prev) => [...prev, newMsg]);

        // Se a mensagem for de outro usuário, toca o som característico de mensagem do Discord
        if (newMsg.sender?.id !== currentUser?.id) {
          playSound('message');
        }
      }
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, channel, currentUser]);

  // Auto-scroll para a mensagem mais recente
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Indicador de "digitando..."
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (socket && channel) {
      socket.emit('typing_start', { channelId: channel.id });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { channelId: channel.id });
      }, 1500);
    }
  };

  // Seleção de arquivo com validação do limite de 10MB
  const handleFileSelect = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Arquivo excede o limite de 10MB! Escolha um arquivo menor para não pesar a rede.');
      setSelectedFile(null);
      return;
    }
    setUploadError('');
    setSelectedFile(file);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    let attachment = null;

    if (selectedFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const uploadRes = await axios.post(`${API_BASE_URL}/api/upload`, formData);
        attachment = uploadRes.data;
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Erro no envio do arquivo.');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
      setSelectedFile(null);
    }

    if (socket && channel) {
      socket.emit('send_message', {
        channelId: channel.id,
        content: inputText,
        attachment
      });

      socket.emit('typing_stop', { channelId: channel.id });
    }

    setInputText('');
  };

  const addEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  const currentTyping = (channel && typingUsers[channel.id]) || [];

  if (!channel || channel.type !== 'text') {
    return (
      <div className="flex-1 bg-discord-chat flex flex-col items-center justify-center text-discord-textMuted p-6">
        <Hash className="w-16 h-16 mb-4 text-[#4e5058]" />
        <h3 className="text-xl font-bold text-discord-textHeader">Nenhum canal de texto selecionado</h3>
        <p className="text-sm">Selecione um canal #texto na barra ao lado para começar a interagir.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-discord-chat flex flex-col h-full overflow-hidden relative">
      {/* Top Header do Canal */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-6 h-6 text-discord-textMuted" />
          <span className="font-bold text-discord-textHeader">{channel.name}</span>
          {channel.topic && (
            <>
              <span className="text-[#4e5058]">|</span>
              <span className="text-xs text-discord-textMuted truncate max-w-md">{channel.topic}</span>
            </>
          )}
        </div>
      </div>

      {/* Lista de Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Banner inicial de boas-vindas do canal */}
        <div className="pt-4 pb-2">
          <div className="w-16 h-16 rounded-full bg-discord-darker flex items-center justify-center mb-2">
            <Hash className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Bem-vindo a #{channel.name}!</h2>
          <p className="text-discord-textMuted text-sm">Este é o começo do canal #{channel.name}. Mensagens são salvas diretamente no banco de dados.</p>
        </div>

        <div className="w-full h-[1px] bg-discord-darker my-2" />

        {/* Mensagens enviadas */}
        {messages.map((msg, index) => {
          const isSameSender =
            index > 0 && messages[index - 1]?.sender?.id === msg.sender?.id;

          const date = new Date(msg.timestamp);
          const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateFormatted = date.toLocaleDateString();

          return (
            <div
              key={msg.id || index}
              className={`flex gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-1 rounded transition ${
                isSameSender ? 'pt-0.5' : 'pt-2'
              }`}
            >
              {!isSameSender ? (
                <img
                  src={msg.sender?.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=user'}
                  alt={msg.sender?.username}
                  onClick={() => onOpenProfile && onOpenProfile(msg.sender)}
                  className="w-10 h-10 rounded-full mt-0.5 shrink-0 bg-discord-darkest object-cover cursor-pointer hover:opacity-85 transition"
                  title="Ver perfil"
                />
              ) : (
                <div className="w-10 shrink-0 text-center">
                  <span className="text-[10px] text-discord-textMuted opacity-0 group-hover:opacity-100 transition">
                    {timeFormatted}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                {!isSameSender && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      onClick={() => onOpenProfile && onOpenProfile(msg.sender)}
                      className="font-semibold text-sm text-discord-textHeader hover:underline cursor-pointer"
                      title="Ver perfil"
                    >
                      {msg.sender?.username}
                    </span>
                    <span className="text-[11px] text-discord-textMuted">{dateFormatted} às {timeFormatted}</span>
                  </div>
                )}

                {msg.content && (
                  <p className="text-sm text-discord-textNormal break-words leading-relaxed select-text">
                    {msg.content}
                  </p>
                )}

                {/* Arquivos / Imagens / GIFs Anexados */}
                {msg.attachment && (
                  <div className="mt-2 max-w-md rounded-lg overflow-hidden border border-discord-darker bg-discord-darker p-1">
                    {msg.attachment.mimetype?.startsWith('image/') ? (
                      <img
                        src={msg.attachment.url}
                        alt={msg.attachment.filename}
                        loading="lazy"
                        className="rounded max-h-80 w-auto object-cover cursor-pointer hover:opacity-95 transition"
                        onClick={() => window.open(msg.attachment.url, '_blank')}
                      />
                    ) : (
                      <div className="flex items-center gap-3 p-2">
                        <Paperclip className="w-6 h-6 text-discord-blurple" />
                        <div className="truncate text-xs">
                          <p className="font-bold text-white truncate">{msg.attachment.filename}</p>
                          <p className="text-discord-textMuted">{Math.round(msg.attachment.size / 1024)} KB</p>
                        </div>
                        <a
                          href={msg.attachment.url}
                          download
                          className="ml-auto bg-discord-blurple px-3 py-1 rounded text-xs text-white hover:bg-discord-blurple-hover transition"
                        >
                          Baixar
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Indicador de quem está digitando */}
      <div className="h-5 px-4 text-xs text-discord-textMuted shrink-0">
        {currentTyping.length > 0 && (
          <div className="flex items-center gap-1.5 animate-pulse">
            <span className="font-semibold text-discord-textNormal">
              {currentTyping.map((u) => u.username).join(', ')}
            </span>
            <span>{currentTyping.length === 1 ? 'está digitando...' : 'estão digitando...'}</span>
          </div>
        )}
      </div>

      {/* Alerta de erro de upload */}
      {uploadError && (
        <div className="mx-4 mb-2 p-2 bg-discord-red/20 border border-discord-red/40 rounded flex items-center justify-between text-xs text-discord-red">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError('')} className="hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Prévia de anexo selecionado */}
      {selectedFile && (
        <div className="mx-4 mb-2 p-2 bg-discord-darker rounded flex items-center justify-between border border-[#3f4147]">
          <div className="flex items-center gap-2 truncate">
            <Paperclip className="w-4 h-4 text-discord-blurple shrink-0" />
            <span className="text-xs text-discord-textNormal truncate">{selectedFile.name}</span>
            <span className="text-[10px] text-discord-textMuted">({Math.round(selectedFile.size / 1024)} KB / máx 10MB)</span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-discord-textMuted hover:text-discord-red"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Caixa de Entrada de Mensagem */}
      <form onSubmit={handleSendMessage} className="px-4 pb-6 shrink-0 relative">
        <div className="bg-[#383a40] rounded-lg flex items-center px-4 py-2.5 gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-discord-textMuted hover:text-white transition"
            title="Enviar anexo (máx 10MB)"
          >
            <PlusCircle className="w-6 h-6" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={`Conversar em #${channel.name}`}
            className="flex-1 bg-transparent text-discord-textHeader placeholder-discord-textMuted text-sm focus:outline-none"
          />

          {/* Seletor de Emojis Corrigido e Categorizado */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-discord-textMuted hover:text-white transition"
              title="Abrir seletor de emojis"
            >
              <Smile className="w-6 h-6" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 w-72 bg-discord-darker border border-[#3f4147] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-[#3f4147] pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Emojis</span>
                  <span className="text-[10px] text-discord-textMuted">Clique para adicionar</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                  {emojiCategories.map((cat) => (
                    <div key={cat.category}>
                      <span className="text-[10px] font-bold text-discord-textMuted uppercase mb-1 block">
                        {cat.category}
                      </span>
                      <div className="grid grid-cols-7 gap-1">
                        {cat.items.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => addEmoji(emoji)}
                            className="text-lg p-1 hover:bg-discord-hover rounded transition hover:scale-125 flex items-center justify-center"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedFile) || isUploading}
            className="text-discord-textMuted hover:text-discord-blurple disabled:opacity-40 transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
