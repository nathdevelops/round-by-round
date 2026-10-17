import { useEffect, useState } from 'react';

/** Read a theme token for use in 3D materials, and follow light/dark changes. */
export function useThemeColor(token: string): string {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#b88a52';
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', update); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return value;
}
