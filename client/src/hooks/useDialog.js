import {useEffect, useRef} from 'react';

// Keep keyboard navigation inside the foremost dialog and restore its opener.
export function useDialog(isOpen, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const node = ref.current, previous = document.activeElement;
    const controls = () => [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
    controls()[0]?.focus();
    const key = e => {
      if ([...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== node) return;
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); }
      if (e.key !== 'Tab') return;
      const all = controls();
      if (!all.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0].focus(); }
    };
    node.addEventListener('keydown', key);
    return () => { node.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);
  return ref;
}
