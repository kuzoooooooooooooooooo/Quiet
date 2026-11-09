import { gzipSync } from 'fflate';
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const bytes = gzipSync(new Uint8Array(event.data), { level: 9 });
    self.postMessage({ bytes: bytes.buffer }, { transfer: [bytes.buffer] });
  } catch {
    self.postMessage({ error: true });
  }
};
