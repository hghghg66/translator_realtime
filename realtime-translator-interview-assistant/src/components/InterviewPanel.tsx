import { useEffect, useRef, useState } from 'react';
import { useInterviewStore } from '../store/interviewStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTranscriptStore } from '../store/transcriptStore';
import { acquireStream, releaseStream } from '../lib/streamControl';
import { initSonioxBridge, onSentence } from '../lib/sonioxBridge';
import { detectQuestion } from '../question/detector';
import { similarity } from '../question/similarity';

export function InterviewPanel({ embedded }: { embedded?: boolean }) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const interview = useInterviewStore();
  const transcript = useTranscriptStore();

  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const candidateRef = useRef<{ q: string; vi: string } | null>(null);

  useEffect(() => {
    initSonioxBridge();
    const off = onSentence((sentence, sentenceVi) => {
      if (!settings?.autoDetectQuestion) return;
      const minLen = 12;
      const det = detectQuestion(sentence, minLen);
      if (!det.isQuestion) return;

      // Dedup with similarity
      const last = useInterviewStore.getState().lastAnalyzedQuestion;
      if (
        settings?.avoidDuplicateQuestions &&
        last &&
        similarity(sentence, last) >= (settings?.duplicateSimilarityThreshold ?? 0.85)
      ) {
        return;
      }

      candidateRef.current = { q: sentence, vi: sentenceVi };
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      const ms = settings?.questionDebounceMs ?? 2000;
      debounceRef.current = window.setTimeout(() => {
        const cand = candidateRef.current;
        if (!cand) return;
        useInterviewStore.getState().setDetected(cand.q, cand.vi || null);
        if (settings?.autoGenerateAnswer) {
          void runAnalyze(cand.q, cand.vi);
        }
      }, ms);
    });
    return () => {
      off();
      if (!embedded && running) void releaseStream().then(() => setRunning(false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoDetectQuestion, settings?.autoGenerateAnswer, settings?.avoidDuplicateQuestions, settings?.duplicateSimilarityThreshold, settings?.questionDebounceMs]);

  const start = async () => {
    if (!settings?.sonioxApiKeySet) {
      setToast('Please set Soniox API key in Settings first.');
      return;
    }
    try {
      await acquireStream();
      setRunning(true);
    } catch (err) {
      setToast(`Mic error: ${(err as Error).message}`);
    }
  };
  const stop = async () => {
    await releaseStream();
    setRunning(false);
  };

  const runAnalyze = async (q: string, vi?: string) => {
    if (!q) return;
    if (!settings?.gptApiKeySet) {
      setToast('Please set GPT API key in Settings first.');
      return;
    }
    interview.setAnalyzing(true);
    interview.setError(null);
    interview.setLastAnalyzedQuestion(q);
    const res = await window.api.gptAnalyze({
      question: q,
      questionTranslationVi: vi,
      answerLanguage: settings.answerLanguage,
      length: settings.answerLength,
      level: settings.answerLevel,
      style: settings.answerStyle,
    });
    interview.setAnalyzing(false);
    if (res.ok && res.result) {
      interview.setResult(res.result);
      interview.setCooldownUntil(Date.now() + (settings.gptCooldownMs ?? 8000));
    } else {
      interview.setError(res.error ?? 'Unknown error');
    }
  };

  const handleAnalyze = () => {
    const q = interview.detectedQuestion;
    if (!q) {
      setToast('No question detected yet.');
      return;
    }
    void runAnalyze(q, interview.detectedQuestionVi ?? undefined);
  };

  const handleImprove = async () => {
    const q = interview.detectedQuestion;
    const cur = interview.result?.suggested_answer;
    if (!q || !cur || !settings) return;
    interview.setAnalyzing(true);
    const res = await window.api.gptImprove({
      question: q,
      answerLanguage: settings.answerLanguage,
      length: settings.answerLength,
      level: settings.answerLevel,
      style: settings.answerStyle,
      currentAnswer: cur,
    });
    interview.setAnalyzing(false);
    if (res.ok && res.result) {
      interview.setResult(res.result);
      interview.setCooldownUntil(Date.now() + (settings.gptCooldownMs ?? 8000));
    } else {
      interview.setError(res.error ?? 'Unknown error');
    }
  };

  const handleSimplify = async () => {
    const q = interview.detectedQuestion;
    const cur = interview.result?.suggested_answer;
    if (!q || !cur || !settings) return;
    interview.setAnalyzing(true);
    const res = await window.api.gptSimplify({
      question: q,
      currentAnswer: cur,
      answerLanguage: settings.answerLanguage,
    });
    interview.setAnalyzing(false);
    if (res.ok && res.result) {
      interview.setResult(res.result);
      interview.setCooldownUntil(Date.now() + (settings.gptCooldownMs ?? 8000));
    } else {
      interview.setError(res.error ?? 'Unknown error');
    }
  };

  const handleCopy = async () => {
    const ans = interview.result?.suggested_answer;
    if (!ans) return;
    await navigator.clipboard.writeText(ans);
    setToast('Answer copied to clipboard.');
  };

  const handleSaveHistory = async () => {
    const q = interview.detectedQuestion;
    if (!q || !interview.result) {
      setToast('Nothing to save.');
      return;
    }
    await window.api.appendHistory({
      id: crypto.randomUUID(),
      type: 'interview',
      createdAt: Date.now(),
      question: q,
      questionTranslationVi: interview.detectedQuestionVi ?? undefined,
      analysis: interview.result,
    });
    setToast('Saved to history.');
  };

  if (!settings) return null;

  return (
    <div className="panel" style={embedded ? { padding: 0 } : undefined}>
      {!embedded && (
        <div className="row toolbar">
          {!running ? (
            <button className="primary" onClick={start}>Start</button>
          ) : (
            <button className="danger" onClick={stop}>Stop</button>
          )}
          <span className={`status ${transcript.status}`}>{transcript.status}</span>
          <span className="checkbox-row">
            <input
              id="auto-detect-q"
              type="checkbox"
              checked={settings.autoDetectQuestion}
              onChange={(e) => updateSettings({ autoDetectQuestion: e.target.checked })}
            />
            <label htmlFor="auto-detect-q">Auto Detect Question</label>
          </span>
          <span className="checkbox-row">
            <input
              id="auto-gen-a"
              type="checkbox"
              checked={settings.autoGenerateAnswer}
              onChange={(e) => updateSettings({ autoGenerateAnswer: e.target.checked })}
            />
            <label htmlFor="auto-gen-a">Auto Generate Answer</label>
          </span>
        </div>
      )}

      <div className="row" style={{ alignItems: 'stretch', flex: 'none' }}>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Detected question (original)</h3>
          <div className="transcript" style={{ minHeight: 64, maxHeight: 120 }}>
            {interview.detectedQuestion ?? '(waiting for a question…)'}
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Vietnamese translation</h3>
          <div className="transcript" style={{ minHeight: 64, maxHeight: 120 }}>
            {interview.detectedQuestionVi ?? '—'}
          </div>
        </div>
      </div>

      <div className="row toolbar">
        <button className="primary" onClick={handleAnalyze} disabled={interview.analyzing || !interview.detectedQuestion}>
          {interview.analyzing ? 'Generating…' : 'Generate Answer'}
        </button>
        <button onClick={handleImprove} disabled={interview.analyzing || !interview.result}>Improve</button>
        <button onClick={handleSimplify} disabled={interview.analyzing || !interview.result}>Simplify</button>
        <button onClick={handleCopy} disabled={!interview.result}>Copy Answer</button>
        <button onClick={handleSaveHistory} disabled={!interview.result}>Save History</button>
      </div>

      <div className="row" style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Question analysis</h3>
          <div className="transcript">
            {interview.error && <div style={{ color: 'var(--danger)' }}>{interview.error}</div>}
            {interview.result ? (
              <>
                <div className="section-title">Ý nghĩa câu hỏi</div>
                <div>{interview.result.question_meaning_vi}</div>
                <div className="section-title">Người phỏng vấn muốn biết</div>
                <div>{interview.result.interviewer_intent_vi}</div>
              </>
            ) : (
              <div style={{ color: 'var(--fg-muted)' }}>(no analysis yet)</div>
            )}
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="card-title">Suggested answer</h3>
          <div className="transcript">
            {interview.result?.suggested_answer || (
              <span style={{ color: 'var(--fg-muted)' }}>(no answer yet)</span>
            )}
            {interview.result?.answer_translation_vi && (
              <>
                <div className="section-title">Bản dịch tiếng Việt</div>
                <div style={{ color: 'var(--fg-muted)' }}>{interview.result.answer_translation_vi}</div>
              </>
            )}
            {interview.result?.useful_phrases?.length ? (
              <>
                <div className="section-title">Cụm từ hữu ích</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {interview.result.useful_phrases.map((p, i) => (
                    <div key={i} className="useful-phrase">
                      <strong>{p.phrase}</strong>
                      <div className="vi">{p.meaning_vi}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {!embedded && (
        <div className="settings-grid">
          <div className="field">
            <label>Answer language</label>
            <select
              value={settings.answerLanguage}
              onChange={(e) => updateSettings({ answerLanguage: e.target.value as any })}
            >
              <option>Vietnamese</option>
              <option>English</option>
              <option>German</option>
            </select>
          </div>
          <div className="field">
            <label>Length</label>
            <select
              value={settings.answerLength}
              onChange={(e) => updateSettings({ answerLength: e.target.value as any })}
            >
              <option>Short</option>
              <option>Medium</option>
              <option>Detailed</option>
            </select>
          </div>
          <div className="field">
            <label>Level</label>
            <select
              value={settings.answerLevel}
              onChange={(e) => updateSettings({ answerLevel: e.target.value as any })}
            >
              <option>Simple</option>
              <option>A2</option>
              <option>B1</option>
              <option>B2</option>
              <option>Professional</option>
            </select>
          </div>
          <div className="field">
            <label>Style</label>
            <select
              value={settings.answerStyle}
              onChange={(e) => updateSettings({ answerStyle: e.target.value as any })}
            >
              <option>Natural</option>
              <option>Professional</option>
              <option>Confident</option>
              <option>Humble</option>
            </select>
          </div>
        </div>
      )}

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}
