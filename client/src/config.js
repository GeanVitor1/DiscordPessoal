/**
 * Camada Centralizada de Configuração de Runtime (RuntimeConfig)
 *
 * Responsável exclusiva pela resolução de URLs, validação do ambiente de execução,
 * status do backend central e logs de inicialização sem hardcodes nos componentes.
 */

const isBrowser = typeof window !== 'undefined';
export const isElectron = isBrowser && !!window.electronAPI?.isDesktop;
const isFileProtocol = isBrowser && window.location.protocol === 'file:';

// 1. Definição do Ambiente
const getEnvironment = () => {
  if (import.meta.env.DEV) {
    return isElectron ? 'desktop-development' : 'development';
  }
  return isElectron ? 'desktop-production' : 'web-production';
};

export const ENVIRONMENT = getEnvironment();

// 2. Resolução Estrita das URLs (Zero fallback silencioso em Produção)
const resolveBaseUrl = () => {
  // Se houver variável de ambiente explicitamente injetada no build
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }

  // Ambientes de Desenvolvimento
  if (ENVIRONMENT === 'development' || ENVIRONMENT === 'desktop-development') {
    return 'http://localhost:5000';
  }

  // Web em Produção: mescla com a mesma origem que serviu a página
  if (ENVIRONMENT === 'web-production') {
    return isBrowser ? window.location.origin : '';
  }

  // Desktop em Produção sem URL configurada:
  // NÃO utilizar localhost silenciosamente! Retorna nulo para acionar a barreira de configuração.
  return null;
};

const resolvedBaseUrl = resolveBaseUrl();

export const API_BASE_URL = resolvedBaseUrl || '';

export const SOCKET_URL =
  import.meta.env.VITE_WS_URL ||
  import.meta.env.VITE_SIGNALING_URL ||
  (resolvedBaseUrl ? resolvedBaseUrl : (ENVIRONMENT === 'development' ? 'http://localhost:5000' : ''));

export const UPLOADS_BASE_URL = resolvedBaseUrl ? `${resolvedBaseUrl}/uploads` : '';

export const IS_SECURE_CONTEXT = isBrowser ? window.isSecureContext : false;

export const IS_BACKEND_CONFIGURED = resolvedBaseUrl !== null && resolvedBaseUrl.length > 0;

// Log inicial de diagnóstico para desenvolvedor / desktop
if (typeof window !== 'undefined') {
  console.log(`\n[Desktop Config]`);
  console.log(`Environment:      ${ENVIRONMENT}`);
  console.log(`Desktop (Electron): ${isElectron}`);
  console.log(`API URL:          ${API_BASE_URL || '(NÃO CONFIGURADO)'}`);
  console.log(`Socket URL:       ${SOCKET_URL || '(NÃO CONFIGURADO)'}`);
  console.log(`Backend Configurado: ${IS_BACKEND_CONFIGURED}\n`);
}
