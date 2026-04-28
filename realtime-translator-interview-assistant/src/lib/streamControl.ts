// Single shared mic + Soniox stream. Reference-counted across modes so
// Combined Mode can run Translator + Interview without opening two streams.

import { startMicCapture, MicHandle } from '../audio/micCapture';

let mic: MicHandle | null = null;
let refCount = 0;
let starting: Promise<void> | null = null;

export async function acquireStream(): Promise<void> {
  if (refCount > 0) {
    refCount += 1;
    return;
  }
  if (starting) {
    await starting;
    refCount += 1;
    return;
  }
  starting = (async () => {
    await window.api.sonioxStart();
    mic = await startMicCapture((chunk) => {
      window.api.sonioxSendChunk(chunk);
    });
  })();
  try {
    await starting;
    refCount = 1;
  } finally {
    starting = null;
  }
}

export async function releaseStream(): Promise<void> {
  if (refCount <= 0) return;
  refCount -= 1;
  if (refCount === 0) {
    if (mic) {
      await mic.stop();
      mic = null;
    }
    await window.api.sonioxStop();
  }
}

export function isStreaming(): boolean {
  return refCount > 0;
}
