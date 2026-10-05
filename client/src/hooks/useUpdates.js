import { useEffect, useState } from 'react';
export function useUpdates() {
  const [state, setState] = useState({ status: window.electronAPI ? 'idle' : 'disabled', percent: 0 });
  useEffect(() => {
    let alive = true, received = false;
    const off = window.electronAPI?.onUpdateState?.(value => { received = true; if (alive) setState(value); });
    window.electronAPI?.getUpdateState?.().then(value => { if (alive && !received) setState(value); }).catch(() => {});
    return () => { alive = false; off?.(); };
  }, []);
  return state;
}
