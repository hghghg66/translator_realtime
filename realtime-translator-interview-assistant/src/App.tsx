import { useEffect, useState } from 'react';
import { useSettingsStore } from './store/settingsStore';
import { TranslatorPanel } from './components/TranslatorPanel';
import { InterviewPanel } from './components/InterviewPanel';
import { CombinedPanel } from './components/CombinedPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';

type Tab = 'translator' | 'interview' | 'combined' | 'settings' | 'history';

export default function App() {
  const { settings, loading, load, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>('translator');

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !settings) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Real-time Translator &amp; Interview Assistant</h1>
        <div className="spacer" />
        <div className="tabs">
          <button className={`tab ${tab === 'translator' ? 'active' : ''}`} onClick={() => setTab('translator')}>Translator</button>
          <button className={`tab ${tab === 'interview' ? 'active' : ''}`} onClick={() => setTab('interview')}>Interview</button>
          {settings.enableCombinedMode && (
            <button className={`tab ${tab === 'combined' ? 'active' : ''}`} onClick={() => setTab('combined')}>Combined</button>
          )}
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
          <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        </div>
        <button
          onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          title="Toggle theme"
        >
          {settings.theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
      <div className="content">
        {tab === 'translator' && <TranslatorPanel />}
        {tab === 'interview' && <InterviewPanel />}
        {tab === 'combined' && settings.enableCombinedMode && <CombinedPanel />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
}
