//! Webview-mode provider — drives ChatGPT / Claude / Gemini web UI through
//! a hidden `WebviewWindow` + injected userscript + `interview-bridge://`
//! navigation interception.
//!
//! See `manager.rs` for lifecycle, `bridge.rs` for the URL scheme parser,
//! `scripts.rs` for the embedded userscripts.

pub mod bridge;
pub mod manager;
pub mod scripts;

use async_trait::async_trait;
use tauri::AppHandle;

use super::parser;
use super::prompt::{build_system_prompt, build_user_prompt};
use super::provider::{InterviewProvider, ProviderConfig};
use super::types::{ConnectionTestResult, InterviewSuggestion};

use manager::{run_session, SessionMode};

pub struct WebviewProvider {
    app: AppHandle,
}

impl WebviewProvider {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

#[async_trait]
impl InterviewProvider for WebviewProvider {
    fn name(&self) -> &'static str {
        "webview"
    }

    async fn suggest(
        &self,
        cfg: &ProviderConfig,
        question: &str,
    ) -> Result<InterviewSuggestion, String> {
        if !cfg.webview_tos_accepted {
            return Ok(InterviewSuggestion::error(
                question.to_string(),
                cfg.answer_language.clone(),
                "webview",
                0,
                "ToS warning not accepted. Tick the checkbox in Settings → Interview.".to_string(),
            ));
        }

        let system = build_system_prompt(cfg);
        let user = build_user_prompt(question);

        // Visibility policy: "always_visible" → always show; else hide.
        // (`show_on_first_question` collapses to always_hidden in PR #3
        // since we re-spawn per question.)
        let visible = cfg.webview_visibility == "always_visible";

        let outcome = run_session(
            self.app.clone(),
            &cfg.webview_provider,
            visible,
            SessionMode::Suggest,
            &system,
            &user,
        )
        .await
        .map_err(|e| e.into_message())?;

        let parsed = parser::parse(&outcome.raw_data).map_err(|e| {
            format!(
                "Webview returned non-JSON content. {e} (provider={})",
                outcome.provider
            )
        })?;

        Ok(InterviewSuggestion::ready(
            question.to_string(),
            cfg.answer_language.clone(),
            &format!("{}-web", outcome.provider),
            outcome.latency_ms,
            parsed.talking_points,
            parsed.sample_answer,
            parsed.follow_up_questions,
        ))
    }

    async fn test_connection(&self, cfg: &ProviderConfig) -> Result<ConnectionTestResult, String> {
        if cfg.webview_provider.is_empty() {
            return Ok(ConnectionTestResult {
                ok: false,
                message: "Pick a webview provider first.".to_string(),
                model_count: None,
                latency_ms: 0,
            });
        }
        // For webview, "test connection" == "is the user signed in?"
        match run_session(
            self.app.clone(),
            &cfg.webview_provider,
            false,
            SessionMode::CheckLogin,
            "",
            "",
        )
        .await
        {
            Ok(outcome) => {
                let signed_in = outcome.raw_data.contains("\"signed_in\":true");
                Ok(ConnectionTestResult {
                    ok: signed_in,
                    message: if signed_in {
                        format!(
                            "Signed in to {} ({}ms)",
                            cfg.webview_provider, outcome.latency_ms
                        )
                    } else {
                        format!("Not signed in to {}.", cfg.webview_provider)
                    },
                    model_count: None,
                    latency_ms: outcome.latency_ms,
                })
            }
            Err(e) => Ok(ConnectionTestResult {
                ok: false,
                message: e.into_message(),
                model_count: None,
                latency_ms: 0,
            }),
        }
    }
}
