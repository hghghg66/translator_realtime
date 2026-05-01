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
    try {
      mic = await startMicCapture((chunk) => {
        window.api.sonioxSendChunk(chunk);
      });
    } catch (err) {
      // Mic acquisition failed (permission denied, no device, etc).
      // Tear down the Soniox connection we just opened so we don't leak it.
      try {
        await window.api.sonioxStop();
      } catch {
        // ignore
      }
      throw err;
    }
  })();
  try {
    await starting;
    refCount = 1;
  } finally {
    starting = null;
  }
}

export async function releaseStream(): Promise<void> {
  // If an acquire is still in flight, wait for it to finish (success or
  // failure) before deciding what to release. Otherwise a fast
  // mount→unmount→remount cycle can leave the mic alive with no owner:
  //   - acquire(): refCount stays 0 until the IIFE finishes.
  //   - release() called now sees refCount === 0 and is a no-op.
  //   - acquire() finishes → refCount = 1 → orphan.
  if (starting) {
    try {
      await starting;
    } catch {
      // Acquire failed; nothing to release.
      return;
    }
  }
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
