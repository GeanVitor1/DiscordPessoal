import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { VoiceProvider } from './context/VoiceContext.jsx';
import { InteractionProvider } from './context/InteractionContext.jsx';

import { PreferencesProvider } from './context/PreferencesContext.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import UpdateNotice from './components/UpdateNotice.jsx';
import { SocialProvider } from './context/SocialContext.jsx';
function AuthGate({ children }) {
  const { currentUser, loading, connection } = useAuth();
  if (connection.status !== 'ready') return <LoginScreen />;
  if (loading) return <div className="h-screen bg-discord-darkest text-white flex items-center justify-center">Carregando...</div>;
  return currentUser ? children : <LoginScreen />;
}

if (import.meta.env.DEV) {
  console.log('[Dev Context Check]', {
    href: window.location.href,
    isSecureContext: window.isSecureContext,
    mediaDevices: !!navigator.mediaDevices,
    getDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <PreferencesProvider><UpdateNotice />
      <AuthGate><SocketProvider>
        <VoiceProvider>
          <InteractionProvider><SocialProvider>
            <App />
          </SocialProvider></InteractionProvider>
        </VoiceProvider>
      </SocketProvider></AuthGate></PreferencesProvider>
    </AuthProvider>
  </React.StrictMode>
);
