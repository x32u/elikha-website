import { useEffect, useState } from 'react';

// Capability-based detection also covers iPads requesting desktop websites,
// including those with a connected mouse or trackpad.
const TOUCH_AR_QUERY = '(any-pointer: coarse), (pointer: coarse), (max-width: 768px)';

export function useTouchArLayout() {
  const [touchLayout, setTouchLayout] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(TOUCH_AR_QUERY).matches
      : false
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(TOUCH_AR_QUERY);
    const update = () => setTouchLayout(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return touchLayout;
}
