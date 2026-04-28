import { useEffect, useState } from 'react';
import type { HistoryItem } from '../../electron/ipc';

export function HistoryPanel() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void window.api.loadHistory().then(setItems);
  }, []);

  const refresh = async () => setItems(await window.api.loadHistory());
  const clear = async () => setItems(await window.api.clearHistory());

  return (
    <div className="panel">
      <div className="row toolbar">
        <button onClick={refresh}>Refresh</button>
        <button className="danger" onClick={clear}>Clear All</button>
        <span style={{ color: 'var(--fg-muted)' }}>{items.length} item(s)</span>
      </div>
      <div className="history-list">
        {items.length === 0 && <div style={{ color: 'var(--fg-muted)' }}>(empty)</div>}
        {items.map((it) => (
          <div key={it.id} className="history-item">
            <div className="when">
              [{it.type}] {new Date(it.createdAt).toLocaleString()}
            </div>
            {it.type === 'translator' ? (
              <>
                <div><strong>Original:</strong> {it.original}</div>
                <div><strong>VI:</strong> {it.translation}</div>
              </>
            ) : (
              <>
                <div><strong>Q:</strong> {it.question}</div>
                {it.questionTranslationVi && <div><strong>Q (VI):</strong> {it.questionTranslationVi}</div>}
                {it.analysis?.suggested_answer && (
                  <div><strong>Answer:</strong> {it.analysis.suggested_answer}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
