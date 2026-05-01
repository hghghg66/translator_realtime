import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import {
  IPC,
  GptAnalyzeRequest,
  HistoryItem,
  AppSettings,
} from './ipc.js';
import {
  getPublicSettings,
  setSettings,
  getSettings,
  getSonioxApiKey,
  getGptApiKey,
} from './store/settings.js';
import { loadHistory, appendHistory, clearHistory } from './store/history.js';
import { SonioxClient, testSonioxConnection } from './soniox/SonioxClient.js';
import { OpenAIClient, testOpenAIConnection } from './openai/OpenAIClient.js';

let mainWindow: BrowserWindow | null = null;
let sonioxClient: SonioxClient | null = null;

function buildOpenAIClient(): OpenAIClient {
  const s = getSettings();
  return new OpenAIClient({
    apiKey: getGptApiKey(),
    baseUrl: s.gptApiBaseUrl,
    model: s.gptModel,
    temperature: s.gptTemperature,
    maxTokens: s.gptMaxTokens,
  });
}
let openaiClient: OpenAIClient | null = null;
function getOpenAI(): OpenAIClient {
  if (!openaiClient) openaiClient = buildOpenAIClient();
  return openaiClient;
}
function refreshOpenAIConfig(): void {
  // Update config on the existing client so the in-memory cooldown timestamp
  // is preserved across settings saves (otherwise rebuilding the client would
  // reset lastCallAt and let the renderer burn a GPT call right after a
  // toggle change).
  const s = getSettings();
  const cfg = {
    apiKey: getGptApiKey(),
    baseUrl: s.gptApiBaseUrl,
    model: s.gptModel,
    temperature: s.gptTemperature,
    maxTokens: s.gptMaxTokens,
  };
  if (openaiClient) openaiClient.update(cfg);
  else openaiClient = new OpenAIClient(cfg);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Real-time Translator & Interview Assistant',
  });

  // External links open in default browser, not inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function ensureSonioxClient(): SonioxClient {
  if (sonioxClient) return sonioxClient;
  const c = new SonioxClient();
  c.on('status', (s) => send(IPC.SONIOX_EVENT_STATUS, s));
  c.on('original', (text, isFinal, language) =>
    send(IPC.SONIOX_EVENT_ORIGINAL, { text, isFinal, language }),
  );
  c.on('translation', (text, isFinal) =>
    send(IPC.SONIOX_EVENT_TRANSLATION, { text, isFinal }),
  );
  c.on('endpoint', () => send(IPC.SONIOX_EVENT_ENDPOINT));
  c.on('error', (msg) => send(IPC.SONIOX_EVENT_ERROR, msg));
  sonioxClient = c;
  return c;
}

function registerIpc(): void {
  // Settings
  ipcMain.handle(IPC.SETTINGS_GET, () => getPublicSettings());
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const out = setSettings(patch);
    // Update OpenAI client config in place — preserves cooldown timestamp.
    refreshOpenAIConfig();
    return out;
  });

  // Soniox
  ipcMain.handle(IPC.SONIOX_START, () => {
    const apiKey = getSonioxApiKey();
    const s = getSettings();
    const c = ensureSonioxClient();
    if (c.isConnected()) c.stop();
    c.start({
      apiKey,
      baseUrl: s.sonioxApiBaseUrl,
      sourceLanguage: s.sourceLanguage,
      targetLanguage: s.targetLanguage || 'vi',
    });
    return { ok: true };
  });
  ipcMain.handle(IPC.SONIOX_STOP, () => {
    sonioxClient?.stop();
    return { ok: true };
  });
  ipcMain.on(IPC.SONIOX_AUDIO_CHUNK, (_e, buffer: ArrayBuffer | Uint8Array) => {
    if (!sonioxClient) return;
    const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    sonioxClient.sendAudioChunk(buf);
  });
  ipcMain.handle(IPC.SONIOX_TEST, async () => {
    const apiKey = getSonioxApiKey();
    const s = getSettings();
    return testSonioxConnection(apiKey, s.sonioxApiBaseUrl);
  });

  // GPT
  ipcMain.handle(IPC.GPT_ANALYZE, async (_e, req: GptAnalyzeRequest) => {
    const s = getSettings();
    const client = getOpenAI();
    const cd = client.ensureCooldown(s.gptCooldownMs);
    if (!cd.ok) {
      return { ok: false, error: `Cooldown active. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` };
    }
    if (!getGptApiKey()) return { ok: false, error: 'GPT API key not set.' };
    try {
      const result = await client.analyze(req);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.GPT_IMPROVE, async (_e, req: GptAnalyzeRequest & { currentAnswer: string }) => {
    const s = getSettings();
    const client = getOpenAI();
    const cd = client.ensureCooldown(s.gptCooldownMs);
    if (!cd.ok) {
      return { ok: false, error: `Cooldown active. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` };
    }
    try {
      const result = await client.improve(req);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.GPT_SIMPLIFY, async (_e, req: { question: string; currentAnswer: string; answerLanguage: GptAnalyzeRequest['answerLanguage'] }) => {
    const s = getSettings();
    const client = getOpenAI();
    const cd = client.ensureCooldown(s.gptCooldownMs);
    if (!cd.ok) {
      return { ok: false, error: `Cooldown active. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` };
    }
    try {
      const result = await client.simplify(req);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.GPT_TEST, async () => {
    const s = getSettings();
    return testOpenAIConnection({
      apiKey: getGptApiKey(),
      baseUrl: s.gptApiBaseUrl,
      model: s.gptModel,
      temperature: s.gptTemperature,
      maxTokens: s.gptMaxTokens,
    });
  });

  // History
  ipcMain.handle(IPC.HISTORY_LOAD, () => loadHistory());
  ipcMain.handle(IPC.HISTORY_APPEND, (_e, item: HistoryItem) => appendHistory(item));
  ipcMain.handle(IPC.HISTORY_CLEAR, () => {
    clearHistory();
    return [];
  });
}

app.whenReady().then(() => {
  // Grant microphone permission requests from the renderer. Without an
  // explicit handler, some Electron / OS combinations silently deny mic
  // access when getUserMedia() is invoked, breaking Translator/Interview/
  // Combined modes.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') return callback(true);
    return callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  sonioxClient?.stop();
  if (process.platform !== 'darwin') app.quit();
});
