import { useEffect, useRef, useState } from 'react';
import { useTranscriptStore } from '../store/transcriptStore';
import { TranscriptView } from './TranscriptView';
import { acquireStream, releaseStream } from '../lib/streamControl';
import { initSonioxBridge } from '../lib/sonioxBridge';
import { useSettingsStore } from '../store/settingsStore';

export function TranslatorPanel() {
  const t = useTranscriptStore();
  const settings = useSettingsStore((s) => s.settings);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Mirror `running` in a ref so the unmount cleanup below sees the latest
  // value. The cleanup closure captures whatever `running` was when the
  // mount-only effect ran (always `false`), so without a ref the mic +
  // Soniox WebSocket leak when the user switches tabs while recording.
  const runningRef = useRef(false);

  useEffect(() => {
    initSonioxBridge();
    return () => {
      if (runningRef.current) void releaseStream();
    };
  }, []);

  const start = async () => {
    if (!settings?.sonioxApiKeySet) {
      setToast('Please set Soniox API key in Settings first.');
      return;
    }
    try {
      await acquireStream();
      runningRef.current = true;
      setRunning(true);
    } catch (err) {
      setToast(`Mic error: ${(err as Error).message}`);
    }
  };
  const stop = async () => {
    await releaseStream();
    runningRef.current = false;
    setRunning(false);
  };

  const copyAll = async () => {
    const text = `--- Original ---\n${t.originalFinal}\n\n--- Vietnamese ---\n${t.translationFinal}`;
    await navigator.clipboard.writeText(text);
    setToast('Copied transcript to clipboard.');
  };
  const clearAll = () => t.clear();

  const saveHistory = async () => {
    if (!t.originalFinal && !t.translationFinal) {
      setToast('Nothing to save.');
      return;
    }
    await window.api.appendHistory({
      id: crypto.randomUUID(),
      type: 'translator',
      createdAt: Date.now(),
      original: t.originalFinal,
      translation: t.translationFinal,
    });
    setToast('Saved to history.');
  };

  return (
    <div className="panel">
      <div className="row toolbar">
        {!running ? (
          <button className="primary" onClick={start}>Start</button>
        ) : (
          <button className="danger" onClick={stop}>Stop</button>
        )}
        <button onClick={copyAll}>Copy</button>
        <button onClick={clearAll}>Clear</button>
        <button onClick={saveHistory}>Save History</button>
        <span className={`status ${t.status}`}>{t.status}</span>
        {t.error && <span className="status error">{t.error}</span>}
      </div>

      <div className="row" style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Original transcript</h3>
          <TranscriptView
            finalText={t.originalFinal}
            provisionalText={t.originalProvisional}
            empty="(Speak into the microphone after pressing Start)"
          />
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Vietnamese translation</h3>
          <TranscriptView
            finalText={t.translationFinal}
            provisionalText={t.translationProvisional}
            empty="(Translation will appear here)"
          />
        </div>
      </div>

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>{toast}</div>
      )}
    </div>
  );
}
