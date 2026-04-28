import { useEffect, useRef, useState } from 'react';
import { useTranscriptStore } from '../store/transcriptStore';
import { useInterviewStore } from '../store/interviewStore';
import { useSettingsStore } from '../store/settingsStore';
import { TranscriptView } from './TranscriptView';
import { acquireStream, releaseStream } from '../lib/streamControl';
import { initSonioxBridge, onSentence } from '../lib/sonioxBridge';
import { detectQuestion } from '../question/detector';
import { similarity } from '../question/similarity';

/**
 * Combined Mode: shows Translator + Interview side by side, sharing a single
 * mic stream + a single Soniox WebSocket.
 */
export function CombinedPanel() {
  const t = useTranscriptStore();
  const interview = useInterviewStore();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const candidateRef = useRef<{ q: string; vi: string } | null>(null);

  useEffect(() => {
    initSonioxBridge();
    const off = onSentence((sentence, sentenceVi) => {
      if (!settings?.autoDetectQuestion) return;
      const det = detectQuestion(sentence, 12);
      if (!det.isQuestion) return;
      const last = useInterviewStore.getState().lastAnalyzedQuestion;
      if (
        settings?.avoidDuplicateQuestions &&
        last &&
        similarity(sentence, last) >= (settings?.duplicateSimilarityThreshold ?? 0.85)
      ) return;
      candidateRef.current = { q: sentence, vi: sentenceVi };
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const cand = candidateRef.current;
        if (!cand) return;
        useInterviewStore.getState().setDetected(cand.q, cand.vi || null);
        if (settings?.autoGenerateAnswer) void runAnalyze(cand.q, cand.vi);
      }, settings?.questionDebounceMs ?? 2000);
    });
    return () => {
      off();
      if (running) void releaseStream().then(() => setRunning(false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoDetectQuestion, settings?.autoGenerateAnswer, settings?.questionDebounceMs, settings?.avoidDuplicateQuestions, settings?.duplicateSimilarityThreshold]);

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
    if (!settings?.gptApiKeySet) {
      setToast('Please set GPT API key in Settings.');
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

  if (!settings) return null;

  return (
    <div className="panel">
      <div className="row toolbar">
        {!running ? (
          <button className="primary" onClick={start}>Start</button>
        ) : (
          <button className="danger" onClick={stop}>Stop</button>
        )}
        <span className={`status ${t.status}`}>{t.status}</span>
        <span className="checkbox-row">
          <input
            id="cm-auto-detect"
            type="checkbox"
            checked={settings.autoDetectQuestion}
            onChange={(e) => updateSettings({ autoDetectQuestion: e.target.checked })}
          />
          <label htmlFor="cm-auto-detect">Auto Detect Question</label>
        </span>
        <span className="checkbox-row">
          <input
            id="cm-auto-gen"
            type="checkbox"
            checked={settings.autoGenerateAnswer}
            onChange={(e) => updateSettings({ autoGenerateAnswer: e.target.checked })}
          />
          <label htmlFor="cm-auto-gen">Auto Generate Answer</label>
        </span>
        <button
          className="primary"
          disabled={!interview.detectedQuestion || interview.analyzing}
          onClick={() => interview.detectedQuestion && runAnalyze(interview.detectedQuestion, interview.detectedQuestionVi ?? undefined)}
        >
          {interview.analyzing ? 'Generating…' : 'Generate Answer'}
        </button>
      </div>

      <div className="combined-grid">
        <div className="card">
          <h3 className="card-title">Original transcript</h3>
          <TranscriptView finalText={t.originalFinal} provisionalText={t.originalProvisional} />
        </div>
        <div className="card">
          <h3 className="card-title">Vietnamese translation</h3>
          <TranscriptView finalText={t.translationFinal} provisionalText={t.translationProvisional} />
        </div>
        <div className="card">
          <h3 className="card-title">Detected question</h3>
          <div className="transcript">
            <strong>Original:</strong> {interview.detectedQuestion ?? '(none)'}
            <br />
            <strong>VI:</strong> {interview.detectedQuestionVi ?? '—'}
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Suggested answer</h3>
          <div className="transcript">
            {interview.error && <div style={{ color: 'var(--danger)' }}>{interview.error}</div>}
            {interview.result?.suggested_answer || <span style={{ color: 'var(--fg-muted)' }}>(no answer yet)</span>}
            {interview.result?.answer_translation_vi && (
              <>
                <div className="section-title">VI</div>
                <div style={{ color: 'var(--fg-muted)' }}>{interview.result.answer_translation_vi}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}
