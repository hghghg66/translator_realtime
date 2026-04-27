//! Google Gemini `generateContent` provider.

use std::time::{Duration, Instant};

use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use super::parser;
use super::prompt::{build_system_prompt, build_user_prompt};
use super::provider::{InterviewProvider, ProviderConfig};
use super::types::{ConnectionTestResult, InterviewSuggestion};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct GeminiProvider;

impl GeminiProvider {
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
}

#[async_trait]
impl InterviewProvider for GeminiProvider {
    fn name(&self) -> &'static str {
        "gemini"
    }

    async fn suggest(
        &self,
        cfg: &ProviderConfig,
        question: &str,
    ) -> Result<InterviewSuggestion, String> {
        let client = Self::build_client()?;
        let model = if cfg.model.is_empty() {
            "gemini-1.5-flash"
        } else {
            cfg.model.as_str()
        };
        let path = format!("/models/{model}:generateContent");
        let url = Self::endpoint(&cfg.base_url, &path);

        let body = json!({
            "system_instruction": {
                "parts": [{ "text": build_system_prompt(cfg) }]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{ "text": build_user_prompt(question) }]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 800,
                "responseMimeType": "application/json"
            }
        });

        let started = Instant::now();
        let resp = client
            .post(&url)
            .query(&[("key", cfg.api_key.as_str())])
            .json(&body)
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

        // Gemini shape: { candidates: [ { content: { parts: [ { text } ] } } ] }
        let content = value
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .and_then(|parts| {
                parts
                    .iter()
                    .find_map(|p| p.get("text").and_then(|t| t.as_str()))
            })
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
        let resp = client
            .get(&url)
            .query(&[("key", cfg.api_key.as_str())])
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

        let model_count = serde_json::from_str::<Value>(&body)
            .ok()
            .as_ref()
            .and_then(|v| v.get("models").and_then(|d| d.as_array()).map(|a| a.len()))
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
