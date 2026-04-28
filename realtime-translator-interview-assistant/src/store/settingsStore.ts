import { create } from 'zustand';
import type { PublicSettings, AppSettings } from '../../electron/ipc';

type SettingsStore = {
  settings: PublicSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  loading: true,
  async load() {
    set({ loading: true });
    const s = await window.api.getSettings();
    set({ settings: s, loading: false });
    document.documentElement.dataset.theme = s.theme;
  },
  async update(patch) {
    const s = await window.api.setSettings(patch);
    set({ settings: s });
    if (patch.theme) document.documentElement.dataset.theme = patch.theme;
  },
}));
