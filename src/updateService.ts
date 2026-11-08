import { isDesktop } from './storage';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';

export type UpdateSupport = 'browser' | 'unconfigured' | 'ready';
export interface PendingUpdate {
  version: string;
  download(onEvent: (event: DownloadEvent) => void, options: { timeout: number }): Promise<void>;
  install(options: { restartAfterInstall: boolean }): Promise<void>;
  close(): Promise<void>;
}

export async function getUpdateSupport(): Promise<UpdateSupport> {
  if (!isDesktop) return 'browser';
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke<boolean>('updater_enabled')) ? 'ready' : 'unconfigured';
}

export async function checkForUpdate(): Promise<PendingUpdate | null> {
  const { check } = await import('@tauri-apps/plugin-updater');
  return check({ timeout: 30_000 });
}
