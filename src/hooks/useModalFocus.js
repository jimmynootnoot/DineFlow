import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(active, onClose) {
  const containerRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => {
      const first = containerRef.current?.querySelector(FOCUSABLE);
      (first || containerRef.current)?.focus();
    });
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = [...containerRef.current.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) { event.preventDefault(); containerRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [active]);

  return containerRef;
}
