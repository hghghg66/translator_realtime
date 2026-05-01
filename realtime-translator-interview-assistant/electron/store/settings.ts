import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS, PublicSettings } from '../ipc.js';

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS,
  // Light obfuscation of the on-disk JSON. Not a security boundary, but
  // prevents casual inspection of API keys.
  encryptionKey: 'rttia-local-store-key-v1',
});

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.store };
}

export function getPublicSettings(): PublicSettings {
  const s = getSettings();
  const { sonioxApiKey, gptApiKey, ...rest } = s;
  return {
    ...rest,
    sonioxApiKeySet: Boolean(sonioxApiKey),
    gptApiKeySet: Boolean(gptApiKey),
  };
}

export function setSettings(patch: Partial<AppSettings>): PublicSettings {
  const merged = { ...getSettings(), ...patch };
  store.store = merged;
  return getPublicSettings();
}

export function getSonioxApiKey(): string {
  return store.get('sonioxApiKey', '');
}

export function getGptApiKey(): string {
  return store.get('gptApiKey', '');
}
