/**
 * Camada Centralizada de Configuração de Runtime (RuntimeConfig)
 *
 * Responsável exclusiva pela resolução de URLs, validação do ambiente de execução,
 * status do backend central e logs de inicialização sem hardcodes nos componentes.
 */

import { resolveServer } from './connection.js';
const isBrowser = typeof window !== 'undefined';
export const isElectron = isBrowser && !!window.electronAPI?.isDesktop;

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
  return resolveServer({
    desktop: isElectron,
    development: import.meta.env.DEV,
    pageOrigin: isBrowser ? window.location.origin : '',
    configured: import.meta.env.VITE_API_URL,
    saved: isBrowser ? localStorage.getItem('backend_url') : null,
    mode: isBrowser ? localStorage.getItem('backend_mode') : null
  });
};

const resolvedBaseUrl = resolveBaseUrl();

export const API_BASE_URL = resolvedBaseUrl || '';

export const SOCKET_URL =
  API_BASE_URL;

export const UPLOADS_BASE_URL = resolvedBaseUrl ? `${resolvedBaseUrl}/uploads` : '';
export const attachmentUrl = value => {
  if (typeof value !== 'string') return '';
  if (value.startsWith('/uploads/')) return `${API_BASE_URL}${value}`;
  return /^https?:\/\//i.test(value) ? value : '';
};

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
