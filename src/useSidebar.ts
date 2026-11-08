import { useCallback, useEffect, useState } from 'react';

const storageKey = 'quiet.sidebar';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(storageKey) === 'collapsed';
  } catch {
    return false;
  }
}

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setCollapsed(readCollapsed());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const toggleSidebar = useCallback((): boolean => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? 'collapsed' : 'expanded');
      return true;
    } catch {
      return false;
    }
  }, [collapsed]);
  return { collapsed, toggleSidebar };
}
