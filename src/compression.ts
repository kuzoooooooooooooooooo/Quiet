export async function compressAttachment(bytes: ArrayBuffer): Promise<Blob> {
  const worker = new Worker(new URL('./compression.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: boolean }>) =>
        event.data.bytes
          ? resolve(new Blob([event.data.bytes]))
          : reject(new Error('Compression failed'));
      worker.onerror = () => reject(new Error('Compression failed'));
      worker.postMessage(bytes); // Keep the source buffer for a raw fallback.
    });
  } finally {
    worker.terminate();
  }
}
