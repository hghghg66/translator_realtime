import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

const DEFAULT_ENDPOINT = 'wss://stt-rt.soniox.com/transcribe-websocket';
const SESSION_DURATION_MS = 3 * 60 * 1000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const MAX_RECONNECT = 3;
const RECONNECT_DELAY_MS = 2000;

export type SonioxClientConfig = {
  apiKey: string;
  baseUrl?: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

type SonioxToken = {
  text: string;
  is_final?: boolean;
  translation_status?: 'original' | 'translation';
  language?: string;
  speaker?: string | number;
  end_ms?: number;
};

type SonioxResponse = {
  tokens?: SonioxToken[];
  error_code?: number;
  error_message?: string;
  finished?: boolean;
};

export interface SonioxEvents {
  status: (status: string) => void;
  original: (text: string, isFinal: boolean, language?: string) => void;
  translation: (text: string, isFinal: boolean) => void;
  endpoint: () => void;
  error: (msg: string) => void;
}

export class SonioxClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private cfg: SonioxClientConfig | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private sessionTimer: NodeJS.Timeout | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private connected = false;

  override on<K extends keyof SonioxEvents>(event: K, listener: SonioxEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof SonioxEvents>(event: K, ...args: Parameters<SonioxEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  isConnected(): boolean {
    return this.connected;
  }

  start(cfg: SonioxClientConfig): void {
    if (!cfg.apiKey) {
      this.emit('error', 'Soniox API key is required.');
      this.emit('status', 'error');
      return;
    }
    this.cfg = cfg;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  stop(): void {
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(Buffer.alloc(0));
        }
        this.ws.close(1000, 'client stop');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connected = false;
    this.emit('status', 'idle');
  }

  sendAudioChunk(chunk: Buffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(chunk);
    } catch (err) {
      console.error('[Soniox] send chunk failed:', err);
    }
  }

  private endpoint(): string {
    const base = this.cfg?.baseUrl?.trim();
    if (!base) return DEFAULT_ENDPOINT;
    if (base.endsWith('/transcribe-websocket')) return base;
    return base.replace(/\/$/, '') + '/transcribe-websocket';
  }

  private openSocket(): void {
    const cfg = this.cfg;
    if (!cfg) return;

    this.emit('status', 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.endpoint());
    } catch (err) {
      this.emit('error', `Failed to create WebSocket: ${(err as Error).message}`);
      this.emit('status', 'error');
      return;
    }

    ws.on('open', () => {
      const config: Record<string, unknown> = {
        api_key: cfg.apiKey,
        model: 'stt-rt-v4',
        audio_format: 'pcm_s16le',
        sample_rate: 16000,
        num_channels: 1,
        enable_endpoint_detection: true,
        max_endpoint_delay_ms: 3000,
        enable_language_identification: true,
      };
      if (cfg.sourceLanguage && cfg.sourceLanguage !== 'auto') {
        config.language_hints = [cfg.sourceLanguage];
      }
      if (cfg.targetLanguage) {
        config.translation = { type: 'one_way', target_language: cfg.targetLanguage };
      }
      try {
        ws.send(JSON.stringify(config));
      } catch (err) {
        this.emit('error', `Failed to send config: ${(err as Error).message}`);
        return;
      }

      this.ws = ws;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('status', 'connected');
      this.startSessionTimer();
      this.startKeepalive();
    });

    ws.on('message', (data) => {
      try {
        const text = data.toString();
        const msg = JSON.parse(text) as SonioxResponse;
        if (msg.error_code) {
          this.emit('error', `Soniox error ${msg.error_code}: ${msg.error_message ?? 'unknown'}`);
          return;
        }
        this.handleResponse(msg);
      } catch (err) {
        console.error('[Soniox] parse failed:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[Soniox] ws error:', err);
      this.emit('error', `WebSocket error: ${(err as Error).message}`);
    });

    ws.on('close', (code, reason) => {
      this.connected = false;
      this.clearTimers();
      this.emit('status', 'closed');
      if (this.intentionalClose) return;
      if (this.reconnectAttempts >= MAX_RECONNECT) {
        this.emit('error', `Disconnected (code ${code}) — gave up after ${MAX_RECONNECT} retries.`);
        return;
      }
      this.reconnectAttempts += 1;
      this.emit('status', 'reconnecting');
      setTimeout(() => {
        if (!this.intentionalClose) this.openSocket();
      }, RECONNECT_DELAY_MS);
      void reason;
    });
  }

  private handleResponse(msg: SonioxResponse): void {
    if (!msg.tokens || msg.tokens.length === 0) return;
    let originalFinal = '';
    let originalNonFinal = '';
    let translationFinal = '';
    let translationNonFinal = '';
    let originalLang: string | undefined;
    let endpointHit = false;

    for (const tok of msg.tokens) {
      if (!tok.text) continue;
      // Soniox uses "<end>" sentinel for endpoint detection.
      if (tok.text === '<end>' || tok.text === '<endpoint>') {
        endpointHit = true;
        continue;
      }
      const isTrans = tok.translation_status === 'translation';
      if (isTrans) {
        if (tok.is_final) translationFinal += tok.text;
        else translationNonFinal += tok.text;
      } else {
        if (tok.is_final) originalFinal += tok.text;
        else originalNonFinal += tok.text;
        if (tok.language && !originalLang) originalLang = tok.language;
      }
    }

    if (originalFinal) this.emit('original', originalFinal, true, originalLang);
    if (originalNonFinal) this.emit('original', originalNonFinal, false, originalLang);
    if (translationFinal) this.emit('translation', translationFinal, true);
    if (translationNonFinal) this.emit('translation', translationNonFinal, false);
    if (endpointHit) this.emit('endpoint');
  }

  private startSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionTimer = setTimeout(() => {
      if (this.intentionalClose) return;
      // Reset session by reopening — Soniox guidance for long sessions.
      this.openSocket();
    }, SESSION_DURATION_MS);
  }

  private startKeepalive(): void {
    this.clearKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'keepalive' }));
        } catch {
          // ignore
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private clearTimers(): void {
    this.clearSessionTimer();
    this.clearKeepalive();
  }
  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }
  private clearKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

/**
 * Lightweight connectivity test: open a WebSocket, send minimal config,
 * wait for the first server message (or success of `started`), then close.
 * Used by the Settings "Test Soniox Connection" button.
 */
export async function testSonioxConnection(
  apiKey: string,
  baseUrl?: string,
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) return { ok: false, message: 'API key is empty.' };
  const endpoint = baseUrl?.trim()
    ? (baseUrl.endsWith('/transcribe-websocket') ? baseUrl : baseUrl.replace(/\/$/, '') + '/transcribe-websocket')
    : DEFAULT_ENDPOINT;

  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(endpoint);
    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      try { ws.close(1000, 'test done'); } catch { /* ignore */ }
      resolve({ ok, message });
    };
    const timeout = setTimeout(() => finish(false, 'Timeout connecting to Soniox.'), 8000);

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({
          api_key: apiKey,
          model: 'stt-rt-v4',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          num_channels: 1,
        }));
      } catch (err) {
        clearTimeout(timeout);
        finish(false, `Failed to send config: ${(err as Error).message}`);
      }
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(data.toString());
        if (msg.error_code) {
          finish(false, `Soniox error ${msg.error_code}: ${msg.error_message ?? 'unknown'}`);
        } else {
          finish(true, 'Connected to Soniox successfully.');
        }
      } catch {
        finish(true, 'Connected (non-JSON pong).');
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      finish(false, `WebSocket error: ${(err as Error).message}`);
    });
  });
}
