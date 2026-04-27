/**
 * Settings Manager — handles loading/saving settings via Tauri IPC
 */

const { invoke } = window.__TAURI__.core;

// Default settings shape — must mirror Rust `Settings` struct in
// `src-tauri/src/settings.rs`. Keep the two in sync when adding fields.
const DEFAULT_SETTINGS = {
  soniox_api_key: '',
  source_language: 'auto',
  target_language: 'vi',
  audio_source: 'system',
  overlay_opacity: 0.85,
  font_size: 16,
  max_lines: 5,
  show_original: true,
  translation_mode: 'soniox',
  custom_context: null,
  elevenlabs_api_key: '',
  tts_enabled: false,
  tts_provider: 'edge',
  tts_voice_id: '21m00Tcm4TlvDq8ikWAM',
  tts_speed: 1.2,
  edge_tts_voice: 'vi-VN-HoaiMyNeural',
  edge_tts_speed: 50,
  tts_auto_read: true,
  google_tts_api_key: '',
  google_tts_voice: 'vi-VN-Chirp3-HD-Aoede',
  google_tts_speed: 1.0,

  // Interview Mode
  interview_enabled: false,
  interview_mode: 'api',
  interview_cv_context: '',
  interview_role_context: '',
  interview_answer_language: '',
  interview_min_question_chars: 8,
  interview_debounce_ms: 1500,
  interview_trigger_source: 'original',
  interview_api_preset: 'openai',
  interview_api_base_url: 'https://api.openai.com/v1',
  interview_api_key: '',
  interview_api_auth_style: 'bearer',
  interview_api_model: 'gpt-4o-mini',
  interview_api_schema: 'openai',
  interview_webview_provider: 'chatgpt',
  interview_webview_signed_in: false,
  interview_chat_strategy: 'fresh',
  interview_webview_visibility: 'always_hidden',
  interview_webview_tos_accepted: false,
};

class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._listeners = [];
  }

  /**
   * Load settings from Rust backend
   */
  async load() {
    try {
      const settings = await invoke('get_settings');
      this.settings = { ...DEFAULT_SETTINGS, ...settings };
    } catch (err) {
      console.error('Failed to load settings:', err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this._notify();
    return this.settings;
  }

  /**
   * Save settings to Rust backend
   */
  async save(newSettings) {
    try {
      const merged = { ...this.settings, ...newSettings };
      await invoke('save_settings', { newSettings: merged });
      this.settings = merged;
      this._notify();
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
    }
  }

  /**
   * Get current settings (cached)
   */
  get() {
    return { ...this.settings };
  }

  /**
   * Subscribe to settings changes
   */
  onChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  _notify() {
    const settings = this.get();
    this._listeners.forEach(cb => cb(settings));
  }
}

// Singleton
export const settingsManager = new SettingsManager();
