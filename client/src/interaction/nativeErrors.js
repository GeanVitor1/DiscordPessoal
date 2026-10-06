export function isRecoverableNativeError(code) {
  return ['ELEVATION_REQUIRED', 'DESKTOP_UNAVAILABLE', 'DESKTOP_SECURE', 'DESKTOP_ACCESS_DENIED', 'DESKTOP_QUERY_FAILED', 'DESKTOP_BIND_FAILED', 'DESKTOP_INACTIVE', 'CURSOR_MOVE_FAILED', 'INPUT_BLOCKED', 'UNKNOWN_SCAN_CODE', 'UNKNOWN_KEY'].includes(code);
}

export function nativeErrorMessage(code, detail) {
  switch (code) {
    case 'SESSION_INACTIVE': case 'SESSION_NOT_ACTIVATED': return 'A autorização nativa desta assistência não está ativa. Solicite uma nova sessão.';
    case 'DISPLAY_MISMATCH': return 'O comando não corresponde à tela autorizada para esta assistência.';
    case 'SESSION_MISMATCH': case 'OWNER_MISMATCH': case 'TOKEN_MISMATCH': case 'GUEST_MISMATCH': case 'REPLAYED_INPUT': return `O comando foi rejeitado pela autorização da assistência (${code}).`;
    case 'ELEVATION_REQUIRED': return 'Esta janela exige permissão de administrador. No computador compartilhado, encerre a assistência e autorize novamente marcando “Permitir controle de programas como administrador”.';
    case 'DESKTOP_SECURE': return 'A área de entrada está no login, bloqueio ou UAC do Windows. A pessoa no computador assistido precisa voltar à área de trabalho para continuar.';
    case 'DESKTOP_ACCESS_DENIED': return 'O helper não conseguiu acessar a área de entrada do Windows. Isso pode ser uma restrição da sessão ou de permissões; não confirma que a tela esteja bloqueada.';
    case 'DESKTOP_QUERY_FAILED': return 'O helper não conseguiu consultar a área de entrada do Windows. Consulte o detalhe do erro no diagnóstico.';
    case 'DESKTOP_BIND_FAILED': return 'O helper não conseguiu conectar sua thread à área de entrada do Windows. Esta é uma falha da conexão nativa, não uma confirmação de tela bloqueada.';
    case 'DESKTOP_INACTIVE': return 'A área de entrada do Windows mudou durante o comando. Tente novamente após a conexão se estabilizar.';
    case 'CURSOR_MOVE_FAILED': return 'O Windows recusou o movimento do cursor. Consulte o diagnóstico para identificar a restrição de entrada.';
    case 'DESKTOP_UNAVAILABLE': return /PROTECTED:(Winlogon|Screen-?saver)/i.test(detail || '') ? 'A área de entrada está no login, bloqueio ou UAC do Windows. Volte à área de trabalho para continuar.' : 'A entrada nativa não conseguiu acessar a área de trabalho. O diagnóstico mostra o motivo; esse erro não confirma uma tela protegida.';
    case 'INPUT_BLOCKED': return 'O Windows bloqueou este comando temporariamente. Volte a uma janela comum e tente novamente.';
    case 'UNKNOWN_SCAN_CODE': case 'UNKNOWN_KEY': return 'Esta tecla não é suportada. A assistência continua disponível para mouse e outras teclas.';
    case 'ELEVATION_CANCELLED': return 'A permissão de administrador foi recusada no Windows. Solicite a assistência novamente para continuar.';
    default: return `Não foi possível aplicar o comando remoto (${code || 'NATIVE_ERROR'}). Consulte o diagnóstico da assistência.`;
  }
}
