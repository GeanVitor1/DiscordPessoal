import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api';
import { useAuth } from './AuthContext';
import { SOCKET_URL } from '../config';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [voiceRooms, setVoiceRooms] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // channelId -> array de user
  const [isConnected, setIsConnected] = useState(false);
  const userRef = useRef(currentUser);
  userRef.current = currentUser;

  useEffect(() => {
    if (!SOCKET_URL) {
      console.warn('[SocketContext] SOCKET_URL não configurada. Conexão em tempo real em espera.');
      return;
    }

    const newSocket = io(SOCKET_URL, {
      auth: { token: getAccessToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,       // Limita tentativas evitando loop infinito desenfreado
      reconnectionDelay: 2000,         // Espera inicial de 2s
      reconnectionDelayMax: 10000,     // Backoff exponencial até no máximo 10s
      timeout: 10000                   // Timeout de 10s para conexão inicial
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Conectado ao servidor via Socket:', newSocket.id);
      if (userRef.current) {
        newSocket.emit('user_join', userRef.current);
      }
    });
    newSocket.on('session_expired', () => window.dispatchEvent(new Event('auth-expired')));
    newSocket.on('connect_error', error => { if (error.message === 'UNAUTHORIZED') window.dispatchEvent(new Event('auth-expired')); });
    newSocket.on('disconnect', () => { setIsConnected(false); setVoiceRooms({}); setOnlineUsers([]); setTypingUsers({}); });

    newSocket.on('users_update', (users) => {
      setOnlineUsers(users);
    });

    newSocket.on('voice_state_update', (rooms) => {
      setVoiceRooms(rooms || {});
    });

    newSocket.on('user_typing', ({ channelId, user }) => {
      setTypingUsers(prev => {
        const current = prev[channelId] || [];
        if (!current.some(u => u.id === user.id)) {
          return { ...prev, [channelId]: [...current, user] };
        }
        return prev;
      });
    });

    newSocket.on('user_stop_typing', ({ channelId, userId }) => {
      setTypingUsers(prev => {
        const current = prev[channelId] || [];
        return { ...prev, [channelId]: current.filter(u => u.id !== userId) };
      });
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Sincroniza usuário e status quando o perfil mudar
  useEffect(() => {
    if (socket?.connected && currentUser) {
      socket.emit('user_join', currentUser);
      socket.emit('status_change', currentUser.status);
    }
  }, [currentUser, socket]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, voiceRooms, typingUsers, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
