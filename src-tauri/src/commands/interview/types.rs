//! Shared types for the Interview Mode subsystem.

use serde::{Deserialize, Serialize};

/// Unified suggestion shape returned to the frontend regardless of which
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
    /// Provider identifier (e.g. "openai", "anthropic", "stub")
    pub provider_used: String,
    /// One of: "ready" | "needs_config" | "needs_login" | "error".
    pub status: String,
    /// Human-readable hint surfaced in the panel under the question.
    pub status_message: String,
}

impl InterviewSuggestion {
    /// Stub used when no provider is configured (or in webview mode in PR #2).
    pub fn placeholder(question: String, answer_language: String, mode: &str) -> Self {
        let hint = match mode {
            "webview" => "Webview mode lands in PR #3. Switch to API mode for now.",
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

    /// Ready response built from a provider's parsed JSON.
    pub fn ready(
        question: String,
        answer_language: String,
        provider: &str,
        latency_ms: u64,
        talking_points: Vec<String>,
        sample_answer: String,
        follow_up_questions: Vec<String>,
    ) -> Self {
        Self {
            question,
            talking_points,
            sample_answer,
            follow_up_questions,
            answer_language,
            latency_ms,
            mode_used: "api".to_string(),
            provider_used: provider.to_string(),
            status: "ready".to_string(),
            status_message: String::new(),
        }
    }

    /// Hard error response (e.g. provider returned a non-2xx).
    pub fn error(
        question: String,
        answer_language: String,
        provider: &str,
        latency_ms: u64,
        message: String,
    ) -> Self {
        Self {
            question,
            talking_points: Vec::new(),
            sample_answer: String::new(),
            follow_up_questions: Vec::new(),
            answer_language,
            latency_ms,
            mode_used: "api".to_string(),
            provider_used: provider.to_string(),
            status: "error".to_string(),
            status_message: message,
        }
    }
}

/// Result of `interview_test_connection`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub model_count: Option<u32>,
    pub latency_ms: u64,
}
