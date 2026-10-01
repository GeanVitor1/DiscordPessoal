import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { VoiceProvider } from './context/VoiceContext.jsx';
import { InteractionProvider } from './context/InteractionContext.jsx';

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
      <SocketProvider>
        <VoiceProvider>
          <InteractionProvider>
            <App />
          </InteractionProvider>
        </VoiceProvider>
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
