//! Interview Mode commands — PR #2 (real API providers).
//!
//! Dispatches to one of 3 provider implementations based on
//! `Settings::interview_api_schema`:
//!   - "openai"    → [`OpenAiCompatProvider`] (covers OpenAI, OpenRouter,
//!                   ChiaseGPU, and any custom OpenAI-compat endpoint)
//!   - "anthropic" → [`AnthropicProvider`]
//!   - "gemini"    → [`GeminiProvider`]
//!
//! In webview mode (PR #3) the command short-circuits to a placeholder.

mod anthropic;
mod gemini;
mod openai_compat;
mod parser;
mod prompt;
mod provider;
mod types;

use tauri::State;

use crate::settings::SettingsState;

use anthropic::AnthropicProvider;
use gemini::GeminiProvider;
use openai_compat::OpenAiCompatProvider;
use provider::{InterviewProvider, ProviderConfig};

pub use types::{ConnectionTestResult, InterviewSuggestion};

/// Generate a single interview suggestion for `question`.
#[tauri::command]
pub async fn interview_suggest(
    question: String,
    state: State<'_, SettingsState>,
) -> Result<InterviewSuggestion, String> {
    let trimmed = question.trim().to_string();
    if trimmed.is_empty() {
        return Err("Question is empty".to_string());
    }

    let snapshot = snapshot_settings(&state)?;

    if !snapshot.enabled {
        return Ok(InterviewSuggestion::placeholder(
            trimmed,
            snapshot.cfg.answer_language.clone(),
            &snapshot.mode,
        ));
    }

    if snapshot.mode == "webview" {
        return Ok(InterviewSuggestion::placeholder(
            trimmed,
            snapshot.cfg.answer_language.clone(),
            "webview",
        ));
    }

    if !snapshot.is_configured() {
        return Ok(InterviewSuggestion::placeholder(
            trimmed,
            snapshot.cfg.answer_language.clone(),
            &snapshot.mode,
        ));
    }

    let provider = pick_provider(&snapshot.cfg.schema);
    provider.suggest(&snapshot.cfg, &trimmed).await
}

/// Test the configured provider's connectivity & auth.
#[tauri::command]
pub async fn interview_test_connection(
    state: State<'_, SettingsState>,
) -> Result<ConnectionTestResult, String> {
    let snapshot = snapshot_settings(&state)?;

    if snapshot.mode == "webview" {
        return Ok(ConnectionTestResult {
            ok: false,
            message: "Test connection is for API mode only.".to_string(),
            model_count: None,
            latency_ms: 0,
        });
    }

    if !snapshot.is_configured() {
        return Ok(ConnectionTestResult {
            ok: false,
            message: "Configure base URL, API key, and model first.".to_string(),
            model_count: None,
            latency_ms: 0,
        });
    }

    let provider = pick_provider(&snapshot.cfg.schema);
    provider.test_connection(&snapshot.cfg).await
}

struct SettingsSnapshot {
    enabled: bool,
    mode: String,
    cfg: ProviderConfig,
}

impl SettingsSnapshot {
    fn is_configured(&self) -> bool {
        !self.cfg.base_url.trim().is_empty()
            && !self.cfg.api_key.trim().is_empty()
            && !self.cfg.model.trim().is_empty()
    }
}

fn snapshot_settings(state: &State<'_, SettingsState>) -> Result<SettingsSnapshot, String> {
    let s = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    Ok(SettingsSnapshot {
        enabled: s.interview_enabled,
        mode: s.interview_mode.clone(),
        cfg: ProviderConfig {
            base_url: s.interview_api_base_url.clone(),
            api_key: s.interview_api_key.clone(),
            auth_style: s.interview_api_auth_style.clone(),
            model: s.interview_api_model.clone(),
            schema: s.interview_api_schema.clone(),
            cv_context: s.interview_cv_context.clone(),
            role_context: s.interview_role_context.clone(),
            answer_language: s.interview_answer_language.clone(),
        },
    })
}

fn pick_provider(schema: &str) -> Box<dyn InterviewProvider> {
    match schema {
        "anthropic" => Box::new(AnthropicProvider),
        "gemini" => Box::new(GeminiProvider),
        // "openai" or any unknown schema falls back to OpenAI-compat.
        _ => Box::new(OpenAiCompatProvider),
    }
}
