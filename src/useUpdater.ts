import { useEffect, useRef, useState } from 'react';
import { checkForUpdate, getUpdateSupport } from './updateService';
import type { PendingUpdate, UpdateSupport } from './updateService';

type Phase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'installed'
  | 'error';
export function useUpdater(loaded: boolean, beforeInstall: () => Promise<void>) {
  const [support, setSupport] = useState<UpdateSupport | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<PendingUpdate | null>(null);
  const downloaded = useRef(false);
  const busy = useRef(false);
  const checked = useRef(false);
  const live = useRef(false);
  const prepare = useRef(beforeInstall);
  prepare.current = beforeInstall;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      const update = pending.current;
      pending.current = null;
      void update?.close().catch(() => undefined);
    };
  }, []);

  async function check(silent = false) {
    if (busy.current) return;
    checked.current = true;
    busy.current = true;
    if (!silent) {
      setPhase('checking');
      setError('');
    }
    try {
      const available = await getUpdateSupport();
      if (!live.current) return;
      setSupport(available);
      if (available !== 'ready') {
        setPhase('idle');
        return;
      }
      // Release resources from a previous check before keeping a new candidate.
      const old = pending.current;
      pending.current = null;
      downloaded.current = false;
      await old?.close();
      const update = await checkForUpdate();
      if (!live.current) {
        await update?.close();
        return;
      }
      pending.current = update;
      setVersion(update?.version ?? '');
      setDismissed(false);
      setPhase(update ? 'available' : silent ? 'idle' : 'current');
    } catch (cause) {
      if (live.current) {
        setPhase(silent ? 'idle' : 'error');
        if (!silent) setError(String(cause));
      }
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!loaded) return;
    // A single startup check, including under React StrictMode's effect replay.
    const timer = window.setTimeout(() => {
      if (!checked.current) void check(true);
    }, 1_000);
    return () => window.clearTimeout(timer);
    // Check operations use refs; changing app data must not schedule more requests.
  }, [loaded]);

  async function install() {
    const update = pending.current;
    if (!update || busy.current) return;
    busy.current = true;
    setError('');
    try {
      if (!downloaded.current) {
        setPhase('downloading');
        setProgress(null);
        let total: number | undefined;
        let received = 0;
        await update.download(
          (event) => {
            if (!live.current) return;
            if (event.event === 'Started') total = event.data.contentLength;
            if (event.event === 'Progress') received += event.data.chunkLength;
            setProgress(total ? Math.min(100, Math.floor((received / total) * 100)) : null);
          },
          { timeout: 120_000 },
        );
        downloaded.current = true;
      }
      if (!live.current) return;
      // Block editing while flushing the most recent write, then launch the installer.
      setPhase('installing');
      await prepare.current();
      await update.install({ restartAfterInstall: true });
      // On Windows install normally exits this process and restarts through NSIS.
      if (live.current) setPhase('installed');
    } catch (cause) {
      if (live.current) {
        setPhase('error');
        setError(String(cause));
      }
    } finally {
      busy.current = false;
    }
  }

  return {
    support,
    phase,
    version,
    progress,
    error,
    check,
    install,
    busy: phase === 'checking' || phase === 'downloading' || phase === 'installing',
    showNotice: !!version && !dismissed && phase === 'available',
    dismiss: () => setDismissed(true),
  };
}
