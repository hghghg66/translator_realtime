import { create } from 'zustand';

type TranscriptStore = {
  originalFinal: string;
  originalProvisional: string;
  translationFinal: string;
  translationProvisional: string;
  status: string;
  error: string | null;
  appendOriginal: (text: string, isFinal: boolean) => void;
  appendTranslation: (text: string, isFinal: boolean) => void;
  setStatus: (s: string) => void;
  setError: (e: string | null) => void;
  clear: () => void;
};

export const useTranscriptStore = create<TranscriptStore>((set) => ({
  originalFinal: '',
  originalProvisional: '',
  translationFinal: '',
  translationProvisional: '',
  status: 'idle',
  error: null,
  appendOriginal(text, isFinal) {
    // Soniox sends the full provisional snapshot in each batch, so non-final
    // text REPLACES the buffer (it does not accumulate). Final text is
    // appended to the persisted history and the provisional buffer is reset.
    set((s) =>
      isFinal
        ? { originalFinal: s.originalFinal + text, originalProvisional: '' }
        : { originalProvisional: text },
    );
  },
  appendTranslation(text, isFinal) {
    set((s) =>
      isFinal
        ? { translationFinal: s.translationFinal + text, translationProvisional: '' }
        : { translationProvisional: text },
    );
  },
  setStatus: (s) => set({ status: s }),
  setError: (e) => set({ error: e }),
  clear: () =>
    set({
      originalFinal: '',
      originalProvisional: '',
      translationFinal: '',
      translationProvisional: '',
      error: null,
    }),
}));
