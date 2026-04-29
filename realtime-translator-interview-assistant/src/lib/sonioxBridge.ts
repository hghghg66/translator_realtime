// Single shared subscription to Soniox events. Multiple panels can subscribe
// without causing duplicate IPC handlers or duplicate streams.

import { useTranscriptStore } from '../store/transcriptStore';

type SentenceListener = (sentence: string, sentenceVi: string) => void;
const sentenceListeners = new Set<SentenceListener>();

let bridgeStarted = false;

// Buffers for endpoint-based sentence flushing.
let pendingOriginal = '';
let pendingTranslation = '';

/**
 * Initialize bridge once. Idempotent.
 */
export function initSonioxBridge(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;

  window.api.onSonioxOriginal(({ text, isFinal }) => {
    useTranscriptStore.getState().appendOriginal(text, isFinal);
    if (isFinal) pendingOriginal += text;
  });
  window.api.onSonioxTranslation(({ text, isFinal }) => {
    useTranscriptStore.getState().appendTranslation(text, isFinal);
    if (isFinal) pendingTranslation += text;
  });
  window.api.onSonioxStatus((s) => {
    useTranscriptStore.getState().setStatus(s);
    // When the active socket goes idle (user pressed Stop), drop any
    // partially-buffered final tokens so the next session does not flush
    // stale text from the previous session into onSentence listeners.
    if (s === 'idle') {
      pendingOriginal = '';
      pendingTranslation = '';
    }
  });
  window.api.onSonioxError((msg) => {
    useTranscriptStore.getState().setError(msg);
  });
  window.api.onSonioxEndpoint(() => {
    flushSentence();
  });
}

function flushSentence(): void {
  const sentence = pendingOriginal.trim();
  const sentenceVi = pendingTranslation.trim();
  pendingOriginal = '';
  pendingTranslation = '';
  if (!sentence) return;
  for (const cb of sentenceListeners) {
    try { cb(sentence, sentenceVi); } catch (err) { console.error(err); }
  }
}

export function onSentence(cb: SentenceListener): () => void {
  sentenceListeners.add(cb);
  return () => sentenceListeners.delete(cb);
}
