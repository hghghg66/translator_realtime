import { create } from 'zustand';
import type { PublicSettings, AppSettings } from '../../electron/ipc';

type SettingsStore = {
  settings: PublicSettings | null;
  loading: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  loading: true,
  loadError: null,
  async load() {
    set({ loading: true, loadError: null });
    try {
      if (!window.api) {
        throw new Error(
          'window.api is missing — Electron preload bridge failed to load. Check the preload script path and the Electron main process logs.',
        );
      }
      const s = await window.api.getSettings();
      set({ settings: s, loading: false });
      document.documentElement.dataset.theme = s.theme;
    } catch (err) {
      set({ loading: false, loadError: (err as Error).message });
    }
  },
  async update(patch) {
    const s = await window.api.setSettings(patch);
    set({ settings: s });
    if (patch.theme) document.documentElement.dataset.theme = patch.theme;
  },
}));
