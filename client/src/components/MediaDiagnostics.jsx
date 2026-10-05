import React from 'react';
export default function MediaDiagnostics({ peers }) {
  const [open, setOpen] = React.useState(false);
  return <div className="text-xs">
    <button onClick={() => setOpen(!open)} className="px-2 py-1 rounded bg-[#111214]">Diagnóstico de conexão</button>
    {open && <div className="mt-3 space-y-3 max-h-64 overflow-auto">{Object.entries(peers).map(([id, s]) => <div key={id} className="bg-[#111214] p-3 rounded font-mono">
      <p>{id.startsWith('screen:') ? 'Tela / áudio do computador' : 'Voz / câmera'} • {s.state}</p>
      <p>Connection: {s.route || 'Ainda sem par selecionado'} · Selected candidate: {s.localType || '—'} / {s.remoteType || '—'} ({s.protocol || '—'})</p>
      <p>RTT: {s.rttMs ?? '—'} ms · Envio: {s.sendKbps ?? '—'} kbps · Recebimento: {s.receiveKbps ?? '—'} kbps</p>
      {s.media?.map((m, i) => <div key={i} className="mt-2">
        <p>{m.kind} {m.direction} · {m.codec || '—'} · {m.bitrateKbps ?? '—'} kbps · perda {m.lossPercent ?? '—'}% · jitter {m.jitterMs ?? '—'} ms</p>
        <p>Bytes enviados: {m.bytesSent ?? '—'} · recebidos: {m.bytesReceived ?? '—'} · pacotes enviados: {m.packetsSent ?? '—'} · recebidos: {m.packetsReceived ?? '—'}</p>
        {m.kind === 'video' ? <p>{m.width ?? '—'}×{m.height ?? '—'} · {m.fps != null ? Math.round(m.fps) : '—'} FPS · descartados {m.framesDropped ?? '—'} · limite {m.qualityLimitation || '—'}</p> : <p>Energia de áudio recebida: {m.totalAudioEnergy ?? '—'} · FEC {/useinbandfec=1/.test(m.fmtp) ? 'negociado' : 'não informado'} · DTX {/usedtx=1/.test(m.fmtp) ? 'negociado' : 'não informado'}</p>}
      </div>)}
    </div>)}{!Object.keys(peers).length && <p>Aguardando outro participante.</p>}</div>}
  </div>;
}
