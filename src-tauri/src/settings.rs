use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Translation term: source → target mapping for Soniox
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranslationTerm {
    pub source: String,
    pub target: String,
}

/// Custom context for Soniox — provides domain-specific hints
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct CustomContext {
    pub domain: Option<String>,
    pub translation_terms: Vec<TranslationTerm>,
}

/// App settings — persisted to JSON
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct Settings {
    /// Soniox API key
    pub soniox_api_key: String,
    /// Source language: "auto" or ISO 639-1 code
    pub source_language: String,
    /// Target language: ISO 639-1 code
    pub target_language: String,
    /// Audio source: "system" | "microphone" | "both"
    pub audio_source: String,
    /// Overlay opacity: 0.0 - 1.0
    pub overlay_opacity: f64,
    /// Font size in px
    pub font_size: u32,
    /// Max transcript lines to display
    pub max_lines: u32,
    /// Whether to show original text alongside translation
    pub show_original: bool,
    /// Translation mode: "soniox" (cloud API) or "local" (MLX models)
    pub translation_mode: String,
    /// Optional custom context for better transcription
    pub custom_context: Option<CustomContext>,
    /// ElevenLabs API key for TTS narration
    pub elevenlabs_api_key: String,
    /// Whether TTS narration is enabled
    pub tts_enabled: bool,
    /// TTS provider: "edge" | "elevenlabs" | "google"
    pub tts_provider: String,
    /// ElevenLabs voice ID
    pub tts_voice_id: String,
    /// TTS speed multiplier (Web Speech)
    pub tts_speed: f64,
    /// Edge TTS voice name
    pub edge_tts_voice: String,
    /// Edge TTS speed percentage
    pub edge_tts_speed: i32,
    /// Auto-read new translations aloud
    pub tts_auto_read: bool,
    /// Google Cloud TTS API key
    pub google_tts_api_key: String,
    /// Google TTS voice name
    pub google_tts_voice: String,
    /// Google TTS speaking rate
    pub google_tts_speed: f64,

    // === Interview Mode (unified) ===
    /// Whether Interview Mode is enabled
    pub interview_enabled: bool,
    /// "api" | "webview"
    pub interview_mode: String,

    // ─── Common ───
    /// User's CV / background, sent as context to LLM
    pub interview_cv_context: String,
    /// Target role / interview context
    pub interview_role_context: String,
    /// "" = same as target_language; otherwise ISO 639-1 code
    pub interview_answer_language: String,
    /// Min chars in detected question before triggering
    pub interview_min_question_chars: u32,
    /// Debounce delay before firing suggestion
    pub interview_debounce_ms: u64,
    /// "original" | "translation"
    pub interview_trigger_source: String,

    // ─── API mode ───
    /// "openai" | "openrouter" | "chiasegpu" | "anthropic" | "gemini" | "custom"
    pub interview_api_preset: String,
    /// Base URL (auto-fill from preset, editable)
    pub interview_api_base_url: String,
    /// Provider API key
    pub interview_api_key: String,
    /// "bearer" | "x-api-key" | "url-param"
    pub interview_api_auth_style: String,
    /// Model identifier (e.g. "gpt-4o-mini", "claude-3-5-sonnet-20241022")
    pub interview_api_model: String,
    /// Schema interpretation: "openai" | "anthropic" | "gemini"
    pub interview_api_schema: String,

    // ─── Webview mode ───
    /// "chatgpt" | "claude" | "gemini"
    pub interview_webview_provider: String,
    /// Cached state — whether webview has a logged-in session
    pub interview_webview_signed_in: bool,
    /// "fresh" | "same_chat" | "system_prompt"
    pub interview_chat_strategy: String,
    /// "always_hidden" | "show_on_first_question" | "always_visible"
    pub interview_webview_visibility: String,
    /// User explicitly accepted ToS warning
    pub interview_webview_tos_accepted: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            soniox_api_key: String::new(),
            source_language: "auto".to_string(),
            target_language: "vi".to_string(),
            audio_source: "system".to_string(),
            overlay_opacity: 0.85,
            font_size: 16,
            max_lines: 5,
            show_original: true,
            translation_mode: "soniox".to_string(),
            custom_context: None,
            elevenlabs_api_key: String::new(),
            tts_enabled: false,
            tts_provider: "edge".to_string(),
            tts_voice_id: "21m00Tcm4TlvDq8ikWAM".to_string(),
            tts_speed: 1.2,
            edge_tts_voice: "vi-VN-HoaiMyNeural".to_string(),
            edge_tts_speed: 50,
            tts_auto_read: true,
            google_tts_api_key: String::new(),
            google_tts_voice: "vi-VN-Chirp3-HD-Aoede".to_string(),
            google_tts_speed: 1.0,

            // === Interview Mode ===
            interview_enabled: false,
            interview_mode: "api".to_string(),
            interview_cv_context: String::new(),
            interview_role_context: String::new(),
            interview_answer_language: String::new(),
            interview_min_question_chars: 8,
            interview_debounce_ms: 1500,
            interview_trigger_source: "original".to_string(),
            interview_api_preset: "openai".to_string(),
            interview_api_base_url: "https://api.openai.com/v1".to_string(),
            interview_api_key: String::new(),
            interview_api_auth_style: "bearer".to_string(),
            interview_api_model: "gpt-4o-mini".to_string(),
            interview_api_schema: "openai".to_string(),
            interview_webview_provider: "chatgpt".to_string(),
            interview_webview_signed_in: false,
            interview_chat_strategy: "fresh".to_string(),
            interview_webview_visibility: "always_hidden".to_string(),
            interview_webview_tos_accepted: false,
        }
    }
}

/// Get the settings file path
/// ~/Library/Application Support/com.personal.translator/settings.json
fn settings_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("com.personal.translator");
    path.push("settings.json");
    path
}

impl Settings {
    /// Load settings from disk, or return defaults
    pub fn load() -> Self {
        let path = settings_path();
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Self::default(),
            }
        } else {
            Self::default()
        }
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<(), String> {
        let path = settings_path();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
        }

        let json =
            serde_json::to_string_pretty(self).map_err(|e| format!("Failed to serialize: {}", e))?;

        fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))?;

        Ok(())
    }
}

/// Thread-safe settings state managed by Tauri
pub struct SettingsState(pub Mutex<Settings>);
