import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const storageKey = 'quiet.theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const isTheme = (value: unknown): value is Theme =>
  value === 'system' || value === 'light' || value === 'dark';

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    return isTheme(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#25242a' : '#fcfbf8');
}

// Apply the saved appearance before mounting the app.
applyTheme(readTheme());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    const onSystemChange = () => {
      if (theme === 'system') applyTheme(theme);
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setTheme(readTheme());
    };
    systemTheme.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      systemTheme.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [theme]);

  function selectTheme(value: Theme): boolean {
    applyTheme(value);
    setTheme(value);
    try {
      localStorage.setItem(storageKey, value);
      return true;
    } catch {
      return false;
    }
  }

  return { theme, selectTheme };
}
