import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [sonioxKeyInput, setSonioxKeyInput] = useState('');
  const [gptKeyInput, setGptKeyInput] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  if (!settings) return null;

  const saveSonioxKey = async () => {
    if (!sonioxKeyInput) return;
    await update({ sonioxApiKey: sonioxKeyInput });
    setSonioxKeyInput('');
    setToast({ kind: 'success', msg: 'Soniox API key saved.' });
  };
  const saveGptKey = async () => {
    if (!gptKeyInput) return;
    await update({ gptApiKey: gptKeyInput });
    setGptKeyInput('');
    setToast({ kind: 'success', msg: 'GPT API key saved.' });
  };
  const testSoniox = async () => {
    const r = await window.api.testSoniox();
    setToast({ kind: r.ok ? 'success' : 'error', msg: r.message });
  };
  const testGpt = async () => {
    const r = await window.api.testGpt();
    setToast({ kind: r.ok ? 'success' : 'error', msg: r.message });
  };

  return (
    <div className="panel">
      <div className="card">
        <h3 className="card-title">Soniox</h3>
        <div className="settings-grid">
          <div className="field">
            <label>API Key {settings.sonioxApiKeySet ? '(set)' : '(not set)'}</label>
            <div className="row">
              <input
                className="grow"
                type="password"
                placeholder={settings.sonioxApiKeySet ? '••••••••' : 'paste key'}
                value={sonioxKeyInput}
                onChange={(e) => setSonioxKeyInput(e.target.value)}
              />
              <button onClick={saveSonioxKey} disabled={!sonioxKeyInput}>Save</button>
              <button
                className="danger"
                onClick={async () => { await update({ sonioxApiKey: '' }); setToast({ kind: 'success', msg: 'Soniox key cleared.' }); }}
              >Clear</button>
            </div>
          </div>
          <div className="field">
            <label>API Base URL (optional, defaults to wss://stt-rt.soniox.com)</label>
            <input
              type="text"
              value={settings.sonioxApiBaseUrl}
              onChange={(e) => update({ sonioxApiBaseUrl: e.target.value })}
              placeholder="wss://stt-rt.soniox.com"
            />
          </div>
          <div className="field">
            <label>Source language</label>
            <select
              value={settings.sourceLanguage}
              onChange={(e) => update({ sourceLanguage: e.target.value })}
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="vi">Vietnamese</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
              <option value="ko">Korean</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
          </div>
          <div className="field">
            <label>Target language</label>
            <input value="vi (Vietnamese)" disabled />
          </div>
          <div className="full">
            <button onClick={testSoniox}>Test Soniox Connection</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">OpenAI / GPT</h3>
        <div className="settings-grid">
          <div className="field">
            <label>API Key {settings.gptApiKeySet ? '(set)' : '(not set)'}</label>
            <div className="row">
              <input
                className="grow"
                type="password"
                placeholder={settings.gptApiKeySet ? '••••••••' : 'paste key'}
                value={gptKeyInput}
                onChange={(e) => setGptKeyInput(e.target.value)}
              />
              <button onClick={saveGptKey} disabled={!gptKeyInput}>Save</button>
              <button
                className="danger"
                onClick={async () => { await update({ gptApiKey: '' }); setToast({ kind: 'success', msg: 'GPT key cleared.' }); }}
              >Clear</button>
            </div>
          </div>
          <div className="field">
            <label>Base URL</label>
            <input
              value={settings.gptApiBaseUrl}
              onChange={(e) => update({ gptApiBaseUrl: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Model</label>
            <input
              value={settings.gptModel}
              onChange={(e) => update({ gptModel: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={settings.gptTemperature}
              onChange={(e) => update({ gptTemperature: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Max tokens</label>
            <input
              type="number"
              min="50"
              max="4000"
              value={settings.gptMaxTokens}
              onChange={(e) => update({ gptMaxTokens: Number(e.target.value) })}
            />
          </div>
          <div className="full">
            <button onClick={testGpt}>Test GPT Connection</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Behavior</h3>
        <div className="settings-grid">
          <div className="checkbox-row">
            <input
              id="enable-combined"
              type="checkbox"
              checked={settings.enableCombinedMode}
              onChange={(e) => update({ enableCombinedMode: e.target.checked })}
            />
            <label htmlFor="enable-combined">Enable Combined Mode</label>
          </div>
          <div className="checkbox-row">
            <input
              id="auto-detect"
              type="checkbox"
              checked={settings.autoDetectQuestion}
              onChange={(e) => update({ autoDetectQuestion: e.target.checked })}
            />
            <label htmlFor="auto-detect">Auto Detect Question</label>
          </div>
          <div className="checkbox-row">
            <input
              id="auto-gen"
              type="checkbox"
              checked={settings.autoGenerateAnswer}
              onChange={(e) => update({ autoGenerateAnswer: e.target.checked })}
            />
            <label htmlFor="auto-gen">Auto Generate Answer</label>
          </div>
          <div className="checkbox-row">
            <input
              id="avoid-dup"
              type="checkbox"
              checked={settings.avoidDuplicateQuestions}
              onChange={(e) => update({ avoidDuplicateQuestions: e.target.checked })}
            />
            <label htmlFor="avoid-dup">Avoid duplicate questions</label>
          </div>
          <div className="field">
            <label>Question debounce (ms)</label>
            <input
              type="number"
              min="0"
              step="500"
              value={settings.questionDebounceMs}
              onChange={(e) => update({ questionDebounceMs: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>GPT cooldown (ms)</label>
            <input
              type="number"
              min="1000"
              step="500"
              value={settings.gptCooldownMs}
              onChange={(e) => update({ gptCooldownMs: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Duplicate similarity threshold (0-1)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={settings.duplicateSimilarityThreshold}
              onChange={(e) => update({ duplicateSimilarityThreshold: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>{toast.msg}</div>
      )}
    </div>
  );
}
