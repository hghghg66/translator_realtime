//! Interview Mode — dispatcher + types.
//!
//! PR #1 (foundation): types only + a stub `interview_suggest` command that
//! returns a placeholder so the frontend panel can render an "unconfigured"
//! state. PR #2 will plug in real API providers (OpenAI / Anthropic / Gemini /
//! ChiaseGPU / Custom). PR #3 will add the webview fallback path.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::settings::SettingsState;

/// Unified suggestion shape returned to the frontend, regardless of which
/// provider/mode produced it.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InterviewSuggestion {
    pub question: String,
    pub talking_points: Vec<String>,
    pub sample_answer: String,
    pub follow_up_questions: Vec<String>,
    pub answer_language: String,
    pub latency_ms: u64,
    /// "api" | "webview" | "stub"
    pub mode_used: String,
    /// Provider identifier (e.g. "openai", "chatgpt-web", "stub")
    pub provider_used: String,
    /// Non-fatal status — frontend uses this to render hints in the panel.
    /// One of: "ready" | "needs_config" | "needs_login" | "error".
    pub status: String,
    /// Human-readable hint (shown in the panel under the question).
    pub status_message: String,
}

impl InterviewSuggestion {
    /// Stub response used in PR #1 when no real provider is wired.
    /// The frontend renders this as an "unconfigured" state.
    fn placeholder(question: String, answer_language: String, mode: &str) -> Self {
        let hint = match mode {
            "webview" => "Configure a webview provider in Settings → Interview.",
            _ => "Add an API key in Settings → Interview, or switch to Webview mode.",
        };
        Self {
            question,
            talking_points: Vec::new(),
            sample_answer: String::new(),
            follow_up_questions: Vec::new(),
            answer_language,
            latency_ms: 0,
            mode_used: "stub".to_string(),
            provider_used: "stub".to_string(),
            status: "needs_config".to_string(),
            status_message: hint.to_string(),
        }
    }
}

/// Result of `interview_test_connection`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub model_count: Option<u32>,
}

/// `interview_suggest` — entry point invoked by the frontend whenever the
/// heuristic detector decides a user-visible question warrants a suggestion.
///
/// PR #1 always returns a placeholder. PR #2 will dispatch to a real
/// `InterviewProvider` impl based on `settings.interview_mode`.
#[tauri::command]
pub async fn interview_suggest(
    question: String,
    state: State<'_, SettingsState>,
) -> Result<InterviewSuggestion, String> {
    let settings = state
        .0
        .lock()
        .map_err(|e| format!("Settings lock poisoned: {}", e))?
        .clone();

    let answer_language = if settings.interview_answer_language.is_empty() {
        settings.target_language.clone()
    } else {
        settings.interview_answer_language.clone()
    };

    Ok(InterviewSuggestion::placeholder(
        question,
        answer_language,
        &settings.interview_mode,
    ))
}

/// `interview_test_connection` — stub for PR #1. PR #2 will perform a real
/// `GET /models` (or provider-specific equivalent) probe.
#[tauri::command]
pub async fn interview_test_connection(
    _state: State<'_, SettingsState>,
) -> Result<ConnectionTestResult, String> {
    Ok(ConnectionTestResult {
        ok: false,
        message: "Test connection will be available in PR #2 (API mode).".to_string(),
        model_count: None,
    })
}
