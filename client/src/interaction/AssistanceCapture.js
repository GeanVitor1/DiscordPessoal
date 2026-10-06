// Fresh desktop capture owned by assistance; screen-sharing tracks are never cloned/reused.
export async function captureAssistanceDisplay(displayId) {
  const sources = await window.electronAPI.getScreenSources();
  const source = sources.find(s => s.id.startsWith('screen:') && String(s.display_id) === String(displayId));
  if (!source) throw new Error('A tela selecionada para assistência não está disponível.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ mandatory:{ chromeMediaSource:'desktop', chromeMediaSourceId:source.id, maxWidth:1920, maxHeight:1080, maxFrameRate:30 } } });
  if (!stream.getVideoTracks().some(t => t.readyState === 'live')) { stream.getTracks().forEach(t=>t.stop()); throw new Error('A captura da assistência não iniciou.'); }
  return stream;
}
