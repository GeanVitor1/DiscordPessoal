import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('discord_user_v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    const randId = Math.random().toString(36).substring(2, 8);
    return {
      id: 'usr_' + randId,
      username: 'User_' + randId.toUpperCase(),
      discriminator: Math.floor(1000 + Math.random() * 9000),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${randId}`,
      banner: '',
      bannerColor: '#5865F2',
      bio: 'Adoro usar o Discord Web Clone 🚀',
      status: 'online', // 'online', 'idle', 'dnd', 'offline'
      customStatus: 'Personalizando perfil'
    };
  });

  // Salva no localStorage e sincroniza com o banco de dados SQLite
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('discord_user_v2', JSON.stringify(currentUser));
      if (!API_BASE_URL) return;

      axios.post(`${API_BASE_URL}/api/users/sync`, {
        id: currentUser.id,
        username: currentUser.username,
        discriminator: currentUser.discriminator,
        avatar: currentUser.avatar,
        banner: currentUser.banner,
        banner_color: currentUser.bannerColor,
        bio: currentUser.bio,
        status: currentUser.status,
        custom_status: currentUser.customStatus
      }).catch(err => console.warn('Erro ao sincronizar perfil com DB:', err));
    }
  }, [currentUser]);

  const updateStatus = (status) => {
    setCurrentUser(prev => ({ ...prev, status }));
  };

  const updateProfile = (data) => {
    setCurrentUser(prev => ({ ...prev, ...data }));
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, updateStatus, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
