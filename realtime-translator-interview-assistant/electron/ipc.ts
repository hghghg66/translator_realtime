// Shared IPC channel names + payload types between main and renderer.

export const IPC = {
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_KEYS_STATUS: 'settings:keys-status',

  // Soniox streaming
  SONIOX_START: 'soniox:start',
  SONIOX_STOP: 'soniox:stop',
  SONIOX_AUDIO_CHUNK: 'soniox:audio-chunk',
  SONIOX_TEST: 'soniox:test',

  SONIOX_EVENT_ORIGINAL: 'soniox:event:original',
  SONIOX_EVENT_TRANSLATION: 'soniox:event:translation',
  SONIOX_EVENT_STATUS: 'soniox:event:status',
  SONIOX_EVENT_ERROR: 'soniox:event:error',
  SONIOX_EVENT_ENDPOINT: 'soniox:event:endpoint',

  // GPT
  GPT_ANALYZE: 'gpt:analyze',
  GPT_IMPROVE: 'gpt:improve',
  GPT_SIMPLIFY: 'gpt:simplify',
  GPT_TEST: 'gpt:test',

  // History
  HISTORY_LOAD: 'history:load',
  HISTORY_APPEND: 'history:append',
  HISTORY_CLEAR: 'history:clear',
} as const;

export type SonioxStartConfig = {
  sourceLanguage?: string; // e.g. "auto" | "en" | "de" | "vi"
  targetLanguage: string;  // "vi"
};

export type SonioxStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

export type AnswerLanguage = 'Vietnamese' | 'English' | 'German';
export type AnswerLength = 'Short' | 'Medium' | 'Detailed';
export type AnswerLevel = 'Simple' | 'A2' | 'B1' | 'B2' | 'Professional';
export type AnswerStyle = 'Natural' | 'Professional' | 'Confident' | 'Humble';

export type GptAnalyzeRequest = {
  question: string;
  questionTranslationVi?: string;
  answerLanguage: AnswerLanguage;
  length: AnswerLength;
  level: AnswerLevel;
  style: AnswerStyle;
};

export type UsefulPhrase = { phrase: string; meaning_vi: string };

export type GptAnalyzeResult = {
  question_meaning_vi: string;
  interviewer_intent_vi: string;
  suggested_answer: string;
  answer_translation_vi: string | null;
  useful_phrases: UsefulPhrase[];
};

export type AppSettings = {
  // Soniox
  sonioxApiKey: string;
  sonioxApiBaseUrl: string; // wss://stt-rt.soniox.com  (default if blank)
  sourceLanguage: string;   // "auto" by default
  targetLanguage: string;   // "vi" (locked)

  // GPT
  gptApiKey: string;
  gptApiBaseUrl: string;    // https://api.openai.com/v1
  gptModel: string;         // gpt-4.1-mini
  gptTemperature: number;
  gptMaxTokens: number;

  // Behavior
  enableCombinedMode: boolean;
  autoDetectQuestion: boolean;
  autoGenerateAnswer: boolean;
  questionDebounceMs: number;
  gptCooldownMs: number;
  avoidDuplicateQuestions: boolean;
  duplicateSimilarityThreshold: number;

  // Answer style
  answerLanguage: AnswerLanguage;
  answerLength: AnswerLength;
  answerLevel: AnswerLevel;
  answerStyle: AnswerStyle;

  // UI
  theme: 'dark' | 'light';
};

export const DEFAULT_SETTINGS: AppSettings = {
  sonioxApiKey: '',
  sonioxApiBaseUrl: '',
  sourceLanguage: 'auto',
  targetLanguage: 'vi',

  gptApiKey: '',
  gptApiBaseUrl: 'https://api.openai.com/v1',
  gptModel: 'gpt-4.1-mini',
  gptTemperature: 0.4,
  gptMaxTokens: 800,

  enableCombinedMode: false,
  autoDetectQuestion: true,
  autoGenerateAnswer: false,
  questionDebounceMs: 2000,
  gptCooldownMs: 8000,
  avoidDuplicateQuestions: true,
  duplicateSimilarityThreshold: 0.85,

  answerLanguage: 'Vietnamese',
  answerLength: 'Medium',
  answerLevel: 'B2',
  answerStyle: 'Natural',

  theme: 'dark',
};

// Public (sanitized) settings — never include raw API keys.
export type PublicSettings = Omit<
  AppSettings,
  'sonioxApiKey' | 'gptApiKey'
> & {
  sonioxApiKeySet: boolean;
  gptApiKeySet: boolean;
};

export type HistoryItemType = 'translator' | 'interview';

export type HistoryItem = {
  id: string;
  type: HistoryItemType;
  createdAt: number;
  // Translator
  original?: string;
  translation?: string;
  // Interview
  question?: string;
  questionTranslationVi?: string;
  analysis?: GptAnalyzeResult;
};
