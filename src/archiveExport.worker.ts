import { zipSync } from 'fflate';
self.onmessage = (event: MessageEvent<{ files: { name: string; bytes: ArrayBuffer }[] }>) => {
  try {
    const files = Object.fromEntries(
      event.data.files.map((f) => [f.name, new Uint8Array(f.bytes)]),
    );
    const bytes = zipSync(files, { level: 0 });
    (
      self as unknown as { postMessage: (value: unknown, transfer: Transferable[]) => void }
    ).postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
  } catch {
    self.postMessage({ error: true });
  }
};
