import { useSyncExternalStore } from 'react';
export interface Preferences {
  autoFormat: boolean;
  showNotes: boolean;
  projectView: 'cards' | 'list';
  projectSort: 'recent' | 'name';
  recentProjects: Record<string, number>;
}
const key = 'quiet.preferences';
function read(): Preferences {
  const defaults: Preferences = {
    autoFormat: false,
    showNotes: true,
    projectView: 'cards',
    projectSort: 'recent',
    recentProjects: {},
  };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const recent = value.recentProjects;
    return {
      autoFormat: value.autoFormat === true,
      showNotes: value.showNotes !== false,
      projectView: value.projectView === 'list' ? 'list' : 'cards',
      projectSort: value.projectSort === 'name' ? 'name' : 'recent',
      recentProjects:
        recent && typeof recent === 'object' && !Array.isArray(recent)
          ? Object.fromEntries(
              Object.entries(recent)
                .filter(
                  (row): row is [string, number] =>
                    typeof row[1] === 'number' && Number.isFinite(row[1]) && row[1] >= 0,
                )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2000),
            )
          : {},
    };
  } catch {
    return defaults;
  }
}
let snapshot = read();
const listeners = new Set<() => void>();
window.addEventListener('storage', (event) => {
  if (event.key === key || event.key === null) {
    snapshot = read();
    listeners.forEach((fn) => fn());
  }
});
export function updatePreferences(patch: Partial<Preferences>): boolean {
  snapshot = { ...snapshot, ...patch };
  let saved = true;
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    saved = false;
  }
  listeners.forEach((fn) => fn());
  return saved;
}
export function markProjectOpened(id: string) {
  const recentProjects = Object.fromEntries(
    Object.entries({ ...snapshot.recentProjects, [id]: Date.now() })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2000),
  );
  return updatePreferences({ recentProjects });
}
export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );
}
