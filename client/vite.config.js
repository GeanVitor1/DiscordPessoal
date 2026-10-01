import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useHttps = env.VITE_USE_HTTPS === 'true' || process.env.VITE_USE_HTTPS === 'true';

  // Alvo do backend (padrão porta 5000 local)
  const backendTarget = env.VITE_BACKEND_TARGET || 'http://127.0.0.1:5000';

  // Caminhos dos certificados mkcert (busca em client/certs ou ../certs)
  const certCandidates = [
    env.VITE_CERT_DIR,
    path.resolve(process.cwd(), 'certs'),
    path.resolve(process.cwd(), '..', 'certs')
  ].filter(Boolean);

  let keyPath = env.VITE_SSL_KEY;
  let certPath = env.VITE_SSL_CERT;

  if (!keyPath || !certPath) {
    for (const dir of certCandidates) {
      const candidateKey = path.join(dir, 'key.pem');
      const candidateCert = path.join(dir, 'cert.pem');
      if (fs.existsSync(candidateKey) && fs.existsSync(candidateCert)) {
        keyPath = candidateKey;
        certPath = candidateCert;
        break;
      }
    }
  }

  let httpsConfig = false;
  if (useHttps) {
    if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      httpsConfig = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    } else {
      console.warn(`\n⚠️  [Vite HTTPS] Certificados não encontrados nos diretórios:\n   ${certCandidates.join('\n   ')}\n   Execute o comando de geração do mkcert para criar os arquivos cert.pem e key.pem.\n`);
    }
  }

  return {
    base: './',
    plugins: [
      react()
    ],
    server: {
      host: '0.0.0.0', // Escuta em todas as interfaces da rede local
      port: 5173,
      strictPort: true,
      https: httpsConfig,
      // Proxy reverso: elimina problemas de Mixed Content e CORS
      // Todas as requisições /api, /socket.io e /uploads trafegam na mesma origem segura (https://IP:5173)
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        },
        '/socket.io': {
          target: backendTarget,
          ws: true,
          changeOrigin: true,
          secure: false
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: 5173
    },
    define: {
      global: 'window',
    }
  };
});
