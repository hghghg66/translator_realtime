import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  AppSettings,
  PublicSettings,
  HistoryItem,
  GptAnalyzeRequest,
  GptAnalyzeResult,
  AnswerLanguage,
} from './ipc.js';

type Unsub = () => void;

const api = {
  // Settings
  getSettings: (): Promise<PublicSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch: Partial<AppSettings>): Promise<PublicSettings> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  // Soniox
  sonioxStart: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SONIOX_START),
  sonioxStop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SONIOX_STOP),
  sonioxSendChunk: (chunk: ArrayBuffer | Uint8Array): void => {
    ipcRenderer.send(IPC.SONIOX_AUDIO_CHUNK, chunk);
  },
  testSoniox: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.SONIOX_TEST),

  onSonioxOriginal: (cb: (p: { text: string; isFinal: boolean; language?: string }) => void): Unsub => {
    const handler = (_e: unknown, p: { text: string; isFinal: boolean; language?: string }) => cb(p);
    ipcRenderer.on(IPC.SONIOX_EVENT_ORIGINAL, handler);
    return () => ipcRenderer.removeListener(IPC.SONIOX_EVENT_ORIGINAL, handler);
  },
  onSonioxTranslation: (cb: (p: { text: string; isFinal: boolean }) => void): Unsub => {
    const handler = (_e: unknown, p: { text: string; isFinal: boolean }) => cb(p);
    ipcRenderer.on(IPC.SONIOX_EVENT_TRANSLATION, handler);
    return () => ipcRenderer.removeListener(IPC.SONIOX_EVENT_TRANSLATION, handler);
  },
  onSonioxStatus: (cb: (s: string) => void): Unsub => {
    const handler = (_e: unknown, s: string) => cb(s);
    ipcRenderer.on(IPC.SONIOX_EVENT_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.SONIOX_EVENT_STATUS, handler);
  },
  onSonioxError: (cb: (msg: string) => void): Unsub => {
    const handler = (_e: unknown, msg: string) => cb(msg);
    ipcRenderer.on(IPC.SONIOX_EVENT_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC.SONIOX_EVENT_ERROR, handler);
  },
  onSonioxEndpoint: (cb: () => void): Unsub => {
    const handler = () => cb();
    ipcRenderer.on(IPC.SONIOX_EVENT_ENDPOINT, handler);
    return () => ipcRenderer.removeListener(IPC.SONIOX_EVENT_ENDPOINT, handler);
  },

  // GPT
  gptAnalyze: (req: GptAnalyzeRequest): Promise<{ ok: boolean; result?: GptAnalyzeResult; error?: string }> =>
    ipcRenderer.invoke(IPC.GPT_ANALYZE, req),
  gptImprove: (req: GptAnalyzeRequest & { currentAnswer: string }): Promise<{ ok: boolean; result?: GptAnalyzeResult; error?: string }> =>
    ipcRenderer.invoke(IPC.GPT_IMPROVE, req),
  gptSimplify: (req: { question: string; currentAnswer: string; answerLanguage: AnswerLanguage }): Promise<{ ok: boolean; result?: GptAnalyzeResult; error?: string }> =>
    ipcRenderer.invoke(IPC.GPT_SIMPLIFY, req),
  testGpt: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.GPT_TEST),

  // History
  loadHistory: (): Promise<HistoryItem[]> => ipcRenderer.invoke(IPC.HISTORY_LOAD),
  appendHistory: (item: HistoryItem): Promise<HistoryItem[]> => ipcRenderer.invoke(IPC.HISTORY_APPEND, item),
  clearHistory: (): Promise<HistoryItem[]> => ipcRenderer.invoke(IPC.HISTORY_CLEAR),
};

contextBridge.exposeInMainWorld('api', api);

export type RendererApi = typeof api;
