//! Interview Mode commands — PR #2 (API providers) + PR #3 (Webview fallback).
//!
//! Dispatches to one of 4 provider implementations based on
//! `Settings::interview_mode` + `interview_api_schema`:
//!   - mode=api, schema="openai"    → [`OpenAiCompatProvider`]
//!     (covers OpenAI, OpenRouter, ChiaseGPU, custom OpenAI-compat endpoints)
//!   - mode=api, schema="anthropic" → [`AnthropicProvider`]
//!   - mode=api, schema="gemini"    → [`GeminiProvider`]
//!   - mode=webview                 → [`WebviewProvider`] (PR #3)

mod anthropic;
mod gemini;
mod openai_compat;
mod parser;
mod prompt;
mod provider;
mod types;
mod webview;

use tauri::{AppHandle, State};

use crate::settings::SettingsState;

use anthropic::AnthropicProvider;
use gemini::GeminiProvider;
use openai_compat::OpenAiCompatProvider;
use provider::{InterviewProvider, ProviderConfig};
use webview::manager::{run_session, SessionMode};
use webview::WebviewProvider;

pub use types::{ConnectionTestResult, InterviewSuggestion};

/// Generate a single interview suggestion for `question`.
#[tauri::command]
pub async fn interview_suggest(
    question: String,
    state: State<'_, SettingsState>,
    app: AppHandle,
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

    let provider: Box<dyn InterviewProvider> = if snapshot.mode == "webview" {
        if !snapshot.cfg.webview_tos_accepted {
            return Ok(InterviewSuggestion::placeholder(
                trimmed,
                snapshot.cfg.answer_language.clone(),
                "webview",
            ));
        }
        Box::new(WebviewProvider::new(app.clone()))
    } else {
        if !snapshot.is_api_configured() {
            return Ok(InterviewSuggestion::placeholder(
                trimmed,
                snapshot.cfg.answer_language.clone(),
                &snapshot.mode,
            ));
        }
        pick_api_provider(&snapshot.cfg.schema)
    };

    provider.suggest(&snapshot.cfg, &trimmed).await
}

/// Test the configured provider's connectivity & auth.
#[tauri::command]
pub async fn interview_test_connection(
    state: State<'_, SettingsState>,
    app: AppHandle,
) -> Result<ConnectionTestResult, String> {
    let snapshot = snapshot_settings(&state)?;

    let provider: Box<dyn InterviewProvider> = if snapshot.mode == "webview" {
        Box::new(WebviewProvider::new(app.clone()))
    } else {
        if !snapshot.is_api_configured() {
            return Ok(ConnectionTestResult {
                ok: false,
                message: "Configure base URL, API key, and model first.".to_string(),
                model_count: None,
                latency_ms: 0,
            });
        }
        pick_api_provider(&snapshot.cfg.schema)
    };

    provider.test_connection(&snapshot.cfg).await
}

/// Open the configured webview provider with the window visible so the
/// user can sign in. Closes after one bridge message ("login-status" or
/// timeout) — caller can reopen if needed.
#[tauri::command]
pub async fn interview_open_webview_login(provider: String, app: AppHandle) -> Result<(), String> {
    run_session(app, &provider, true, SessionMode::CheckLogin, "", "")
        .await
        .map(|_| ())
        .map_err(|e| e.into_message())
}

/// Quietly check whether the user is signed in. Returns `true` / `false`.
#[tauri::command]
pub async fn interview_check_webview_login(
    provider: String,
    app: AppHandle,
) -> Result<bool, String> {
    let outcome = run_session(app, &provider, false, SessionMode::CheckLogin, "", "")
        .await
        .map_err(|e| e.into_message())?;
    Ok(outcome.raw_data.contains("\"signed_in\":true"))
}

/// Toggle visibility of any active interview-mode webview window.
#[tauri::command]
pub async fn interview_set_webview_visible(visible: bool, app: AppHandle) -> Result<(), String> {
    webview::manager::show_webview(app, visible).await
}

struct SettingsSnapshot {
    enabled: bool,
    mode: String,
    cfg: ProviderConfig,
}

impl SettingsSnapshot {
    fn is_api_configured(&self) -> bool {
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
            webview_provider: s.interview_webview_provider.clone(),
            webview_visibility: s.interview_webview_visibility.clone(),
            webview_chat_strategy: s.interview_chat_strategy.clone(),
            webview_tos_accepted: s.interview_webview_tos_accepted,
        },
    })
}

fn pick_api_provider(schema: &str) -> Box<dyn InterviewProvider> {
    match schema {
        "anthropic" => Box::new(AnthropicProvider),
        "gemini" => Box::new(GeminiProvider),
        // "openai" or any unknown schema falls back to OpenAI-compat.
        _ => Box::new(OpenAiCompatProvider),
    }
}
