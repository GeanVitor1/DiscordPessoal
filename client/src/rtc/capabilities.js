export function mediaUnavailableMessage(environment = globalThis.window) {
  if (environment?.isSecureContext === false) {
    return 'Microfone, câmera e compartilhamento de tela exigem uma conexão segura. Abra este endereço com HTTPS (certificado confiável) ou use o aplicativo Desktop. No mesmo computador do servidor, você também pode usar http://localhost:5173.';
  }
  return 'Este navegador não disponibiliza o recurso de mídia solicitado. Use um navegador atualizado com suporte ou o aplicativo Desktop.';
}

export function requireMediaDevices(method, navigatorObject = globalThis.navigator, environment = globalThis.window) {
  const devices = navigatorObject?.mediaDevices;
  if (environment?.isSecureContext === false || typeof devices?.[method] !== 'function') {
    throw new Error(mediaUnavailableMessage(environment));
  }
  return devices;
}
