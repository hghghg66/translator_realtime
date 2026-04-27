//! Userscript bytes embedded at compile time + per-provider metadata.

pub struct ProviderMeta {
    pub id: &'static str,
    pub url: &'static str,
    pub script: &'static str,
}

const CHATGPT_SCRIPT: &str = include_str!("../../../../resources/userscripts/interview_chatgpt.js");
const CLAUDE_SCRIPT: &str = include_str!("../../../../resources/userscripts/interview_claude.js");
const GEMINI_SCRIPT: &str = include_str!("../../../../resources/userscripts/interview_gemini.js");

pub fn lookup(provider: &str) -> Result<ProviderMeta, String> {
    match provider {
        "chatgpt" => Ok(ProviderMeta {
            id: "chatgpt",
            url: "https://chatgpt.com/",
            script: CHATGPT_SCRIPT,
        }),
        "claude" => Ok(ProviderMeta {
            id: "claude",
            url: "https://claude.ai/new",
            script: CLAUDE_SCRIPT,
        }),
        "gemini" => Ok(ProviderMeta {
            id: "gemini",
            url: "https://gemini.google.com/app",
            script: GEMINI_SCRIPT,
        }),
        other => Err(format!("Unknown webview provider: {other}")),
    }
}

/// Build the init script that runs before the page's own JS. The bridge
/// payload is JSON-encoded, so we just inline it after escaping for the
/// JavaScript string context.
pub fn build_init_script(
    user_script: &str,
    mode: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> String {
    let bridge = serde_json::json!({
        "mode":          mode,
        "systemPrompt":  system_prompt,
        "userPrompt":    user_prompt,
    });
    let payload = bridge.to_string();
    format!("(function() {{ window.__INTERVIEW_BRIDGE__ = {payload}; }})();\n{user_script}")
}
