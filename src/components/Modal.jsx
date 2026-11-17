import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ titleId, onClose, busy = false, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.focus();
    function keydown(event) {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const items = [...ref.current.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
        .filter(item => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length && !item.closest('[aria-hidden="true"]'));
      if (!items.length) { event.preventDefault(); ref.current.focus(); return; }
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
        event.preventDefault(); first?.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button className="close-btn" onClick={onClose} disabled={busy} aria-label="Fechar janela"><X /></button>
      {children}
    </section>
  </div>;
}
