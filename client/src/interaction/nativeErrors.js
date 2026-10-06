export function isRecoverableNativeError(code) {
  return ['ELEVATION_REQUIRED', 'DESKTOP_UNAVAILABLE', 'INPUT_BLOCKED', 'UNKNOWN_SCAN_CODE', 'UNKNOWN_KEY'].includes(code);
}

export function nativeErrorMessage(code) {
  switch (code) {
    case 'SESSION_INACTIVE': case 'SESSION_NOT_ACTIVATED': return 'A autorização nativa desta assistência não está ativa. Solicite uma nova sessão.';
    case 'DISPLAY_MISMATCH': return 'O comando não corresponde à tela autorizada para esta assistência.';
    case 'SESSION_MISMATCH': case 'OWNER_MISMATCH': case 'TOKEN_MISMATCH': case 'GUEST_MISMATCH': case 'REPLAYED_INPUT': return `O comando foi rejeitado pela autorização da assistência (${code}).`;
    case 'ELEVATION_REQUIRED': return 'Esta janela exige permissão de administrador. No computador compartilhado, encerre a assistência e autorize novamente marcando “Permitir controle de programas como administrador”.';
    case 'DESKTOP_UNAVAILABLE': return 'O Windows está em uma tela protegida ou bloqueada. A pessoa no computador compartilhado precisa fechar o aviso ou desbloquear a tela para continuar.';
    case 'INPUT_BLOCKED': return 'O Windows bloqueou este comando temporariamente. Volte a uma janela comum e tente novamente.';
    case 'UNKNOWN_SCAN_CODE': case 'UNKNOWN_KEY': return 'Esta tecla não é suportada. A assistência continua disponível para mouse e outras teclas.';
    case 'ELEVATION_CANCELLED': return 'A permissão de administrador foi recusada no Windows. Solicite a assistência novamente para continuar.';
    default: return `Não foi possível aplicar o comando remoto (${code || 'NATIVE_ERROR'}). Consulte o diagnóstico da assistência.`;
  }
}
