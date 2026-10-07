import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api';
import { SOCKET_URL } from '../config';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [voiceRooms, setVoiceRooms] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // channelId -> array de user
  const [isConnected, setIsConnected] = useState(false);

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
      // The authenticated server initializes membership and presence on connect.
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

  // Profile/status changes are already saved by the authenticated REST endpoint.
  // Re-sending user_join/status_change duplicated membership and presence work.

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, voiceRooms, typingUsers, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
