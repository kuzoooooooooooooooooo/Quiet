import { useEffect, useState } from 'react';
export const backgrounds = [
  'quiet',
  'dawn',
  'forest',
  'lavender',
  'ocean',
  'mountains',
  'lake',
  'dunes',
  'woodland',
  'wave',
  'silk',
  'slate',
  'sage',
  'graphite',
  'smoke',
  'dark-sage',
] as const;
export type Background = (typeof backgrounds)[number];
export const backgroundLabels = {
  quiet: 'Стандартний',
  dawn: 'Світанок',
  forest: 'Ліс',
  lavender: 'Лаванда',
  ocean: 'Океан',
  mountains: 'Туманні гори',
  lake: 'Озеро',
  dunes: 'Дюни',
  woodland: 'Ліс у тумані',
  wave: 'Хвиля',
  silk: 'Шовк',
  slate: 'Срібні дуги',
  sage: 'Шавлія',
  graphite: 'Графіт',
  smoke: 'Дим',
  'dark-sage': 'Темна шавлія',
} as const;
export const backgroundGroups = [
  { label: 'Градієнти', values: ['quiet', 'dawn', 'forest', 'lavender', 'ocean'] },
  { label: 'Природа', values: ['mountains', 'lake', 'dunes', 'woodland'] },
  { label: 'Світлі абстрактні', values: ['wave', 'silk', 'slate', 'sage'] },
  { label: 'Темні абстрактні', values: ['graphite', 'smoke', 'dark-sage'] },
] as const;
function read(): Background {
  try {
    const value = localStorage.getItem('quiet.background');
    return backgrounds.includes(value as Background) ? (value as Background) : 'quiet';
  } catch {
    return 'quiet';
  }
}
document.documentElement.dataset.background = read();
export function useBackground() {
  const [background, setBackground] = useState<Background>(read);
  useEffect(() => {
    document.documentElement.dataset.background = background;
  }, [background]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'quiet.background' || event.key === null) setBackground(read());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return {
    background,
    selectBackground: (value: Background) => {
      setBackground(value);
      try {
        localStorage.setItem('quiet.background', value);
        return true;
      } catch {
        return false;
      }
    },
  };
}
