import { create } from 'zustand';
import type { GptAnalyzeResult } from '../../electron/ipc';

type InterviewStore = {
  detectedQuestion: string | null;
  detectedQuestionVi: string | null;
  analyzing: boolean;
  result: GptAnalyzeResult | null;
  error: string | null;
  cooldownUntil: number; // epoch ms
  lastAnalyzedQuestion: string | null;
  setDetected: (q: string | null, vi: string | null) => void;
  setAnalyzing: (b: boolean) => void;
  setResult: (r: GptAnalyzeResult | null) => void;
  setError: (e: string | null) => void;
  setCooldownUntil: (t: number) => void;
  setLastAnalyzedQuestion: (q: string | null) => void;
};

export const useInterviewStore = create<InterviewStore>((set) => ({
  detectedQuestion: null,
  detectedQuestionVi: null,
  analyzing: false,
  result: null,
  error: null,
  cooldownUntil: 0,
  lastAnalyzedQuestion: null,
  setDetected: (q, vi) => set({ detectedQuestion: q, detectedQuestionVi: vi }),
  setAnalyzing: (b) => set({ analyzing: b }),
  setResult: (r) => set({ result: r }),
  setError: (e) => set({ error: e }),
  setCooldownUntil: (t) => set({ cooldownUntil: t }),
  setLastAnalyzedQuestion: (q) => set({ lastAnalyzedQuestion: q }),
}));
