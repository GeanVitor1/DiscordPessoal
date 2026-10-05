export function traceAssist(stage, eventType, sequence, result) {
  try {
    if (!import.meta.env?.DEV && globalThis.localStorage?.getItem('meuapp_diagnostics') !== 'true') return;
    const details = { eventType, sequence, result };
    console.debug(`[ASSIST][${stage}]`, details);
    globalThis.window?.electronAPI?.log?.('app', `[ASSIST][${stage}]`, details).catch(() => {});
  } catch { /* Diagnostics never interrupt input and never include input text or tokens. */ }
}
