//! OpenAI-compatible chat-completions provider.
//!
//! Covers OpenAI, OpenRouter, ChiaseGPU (P2P marketplace), and any other
//! `/v1/chat/completions` endpoint speaking the canonical schema.

use std::time::{Duration, Instant};

use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use super::parser;
use super::prompt::{build_system_prompt, build_user_prompt};
use super::provider::{InterviewProvider, ProviderConfig};
use super::types::{ConnectionTestResult, InterviewSuggestion};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct OpenAiCompatProvider;

impl OpenAiCompatProvider {
    fn build_client() -> Result<Client, String> {
        Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {e}"))
    }

    fn endpoint(base_url: &str, path: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        format!("{trimmed}{path}")
    }

    fn apply_auth(
        mut req: reqwest::RequestBuilder,
        cfg: &ProviderConfig,
    ) -> reqwest::RequestBuilder {
        match cfg.auth_style.as_str() {
            "x-api-key" => req = req.header("x-api-key", &cfg.api_key),
            // Default to bearer token for "bearer" and unknown styles.
            _ => req = req.bearer_auth(&cfg.api_key),
        }
        req
    }
}

#[async_trait]
impl InterviewProvider for OpenAiCompatProvider {
    fn name(&self) -> &'static str {
        "openai_compat"
    }

    async fn suggest(
        &self,
        cfg: &ProviderConfig,
        question: &str,
    ) -> Result<InterviewSuggestion, String> {
        let client = Self::build_client()?;
        let url = Self::endpoint(&cfg.base_url, "/chat/completions");

        let body = json!({
            "model": cfg.model,
            "messages": [
                { "role": "system", "content": build_system_prompt(cfg) },
                { "role": "user",   "content": build_user_prompt(question) }
            ],
            "temperature": 0.4,
            "max_tokens": 600,
            "response_format": { "type": "json_object" }
        });

        let started = Instant::now();
        let req = client.post(&url).json(&body);
        let req = Self::apply_auth(req, cfg);
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
        let latency_ms = started.elapsed().as_millis() as u64;

        let status = resp.status();
        let raw = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {e}"))?;

        if !status.is_success() {
            return Ok(InterviewSuggestion::error(
                question.to_string(),
                cfg.answer_language.clone(),
                self.name(),
                latency_ms,
                format!("HTTP {status}: {}", truncate(&raw, 240)),
            ));
        }

        let value: Value =
            serde_json::from_str(&raw).map_err(|e| format!("Provider returned non-JSON: {e}"))?;

        // Some response_format=json_object servers omit the wrapper. Try the
        // canonical OpenAI shape first, then fall back to treating the whole
        // body as the JSON object.
        let content = value
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| raw.clone());

        let parsed = parser::parse(&content)
            .map_err(|e| format!("{e} (raw content prefix: {})", truncate(&content, 160)))?;

        Ok(InterviewSuggestion::ready(
            question.to_string(),
            cfg.answer_language.clone(),
            self.name(),
            latency_ms,
            parsed.talking_points,
            parsed.sample_answer,
            parsed.follow_up_questions,
        ))
    }

    async fn test_connection(&self, cfg: &ProviderConfig) -> Result<ConnectionTestResult, String> {
        let client = Self::build_client()?;
        let url = Self::endpoint(&cfg.base_url, "/models");

        let started = Instant::now();
        let req = Self::apply_auth(client.get(&url), cfg);
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
        let latency_ms = started.elapsed().as_millis() as u64;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {e}"))?;

        if !status.is_success() {
            return Ok(ConnectionTestResult {
                ok: false,
                message: format!("HTTP {status}: {}", truncate(&body, 240)),
                model_count: None,
                latency_ms,
            });
        }

        // Try to count models; tolerate any shape.
        let model_count = serde_json::from_str::<Value>(&body)
            .ok()
            .as_ref()
            .and_then(|v| v.get("data").and_then(|d| d.as_array()).map(|a| a.len()))
            .map(|n| n as u32);

        Ok(ConnectionTestResult {
            ok: true,
            message: format!(
                "OK ({}ms){}",
                latency_ms,
                model_count
                    .map(|n| format!(" — {n} models"))
                    .unwrap_or_default()
            ),
            model_count,
            latency_ms,
        })
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}
