//! Common abstractions for Interview Mode providers (PR #2).

use async_trait::async_trait;

use super::types::{ConnectionTestResult, InterviewSuggestion};

/// User-supplied configuration for a provider invocation. Built fresh from
/// `Settings` on each call so we can stay stateless.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub base_url: String,
    pub api_key: String,
    pub auth_style: String,
    pub model: String,
    pub schema: String,
    pub cv_context: String,
    pub role_context: String,
    pub answer_language: String,
    // ─── Webview-mode-only fields (PR #3) ───
    pub webview_provider: String,
    pub webview_visibility: String,
    pub webview_chat_strategy: String,
    pub webview_tos_accepted: bool,
}

#[async_trait]
pub trait InterviewProvider: Send + Sync {
    /// Identifier surfaced in `InterviewSuggestion::provider_used`.
    fn name(&self) -> &'static str;

    /// Generate an interview suggestion for the given question.
    async fn suggest(
        &self,
        cfg: &ProviderConfig,
        question: &str,
    ) -> Result<InterviewSuggestion, String>;

    /// Lightweight reachability/auth check.
    async fn test_connection(&self, cfg: &ProviderConfig) -> Result<ConnectionTestResult, String>;
}
