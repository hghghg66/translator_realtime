//! Spawn / drive / tear down a hidden `WebviewWindow` for one suggestion.
//!
//! Each call to [`run_session`] is independent: a brand-new window is
//! opened pointed at the provider's chat URL, the userscript inside posts
//! `interview-bridge://result?data=…`, we cancel that navigation, parse
//! the data, and close the window. This matches the `"fresh"` chat
//! strategy from the spec; `"same_chat"` / `"system_prompt"` are TBD.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use url::Url;

use super::bridge::BridgeMessage;
use super::scripts::{build_init_script, lookup, ProviderMeta};

const SESSION_TIMEOUT: Duration = Duration::from_secs(75);

#[derive(Debug, Clone)]
pub struct SessionOutcome {
    pub provider: String,
    pub raw_data: String,
    pub latency_ms: u64,
}

#[derive(Debug)]
pub enum SessionError {
    NotSignedIn { provider: String },
    Userscript(String),
    Spawn(String),
    Timeout,
}

impl SessionError {
    pub fn into_message(self) -> String {
        match self {
            SessionError::NotSignedIn { provider } => {
                format!("Not signed in to {provider}. Open Settings → Interview → Sign in…")
            }
            SessionError::Userscript(m) => m,
            SessionError::Spawn(m) => format!("Failed to spawn webview: {m}"),
            SessionError::Timeout => "Webview timed out (75s)".to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum SessionMode {
    /// Drive the assistant turn end-to-end.
    Suggest,
    /// Only check whether the user is signed in.
    CheckLogin,
}

impl SessionMode {
    fn as_str(self) -> &'static str {
        match self {
            SessionMode::Suggest => "suggest",
            SessionMode::CheckLogin => "check_login",
        }
    }
}

pub async fn run_session(
    app: AppHandle,
    provider_id: &str,
    visible: bool,
    mode: SessionMode,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<SessionOutcome, SessionError> {
    let meta: ProviderMeta = lookup(provider_id).map_err(SessionError::Spawn)?;
    let provider_label = meta.id.to_string();
    let init = build_init_script(meta.script, mode.as_str(), system_prompt, user_prompt);
    let url = Url::parse(meta.url).map_err(|e| SessionError::Spawn(e.to_string()))?;

    let (tx, mut rx) = unbounded_channel::<BridgeMessage>();
    let label = format!("interview-webview-{}", uuid::Uuid::new_v4());
    let label_for_close = label.clone();

    spawn_window(&app, &label, url, visible, init, tx)?;

    let started = Instant::now();
    let mut sign_in_state: Option<bool> = None;

    let outcome = loop {
        let elapsed = started.elapsed();
        if elapsed >= SESSION_TIMEOUT {
            break Err(SessionError::Timeout);
        }
        let remaining = SESSION_TIMEOUT - elapsed;

        match tokio::time::timeout(remaining, rx.recv()).await {
            Err(_) => break Err(SessionError::Timeout),
            Ok(None) => break Err(SessionError::Userscript("bridge channel closed".into())),
            Ok(Some(msg)) => match msg {
                BridgeMessage::Result { provider, data } => {
                    break Ok(SessionOutcome {
                        provider: if provider.is_empty() {
                            provider_label.clone()
                        } else {
                            provider
                        },
                        raw_data: data,
                        latency_ms: started.elapsed().as_millis() as u64,
                    });
                }
                BridgeMessage::LoginStatus { signed_in, .. } => {
                    sign_in_state = Some(signed_in);
                    if matches!(mode, SessionMode::CheckLogin) {
                        break Ok(SessionOutcome {
                            provider: provider_label.clone(),
                            raw_data: format!(
                                "{{\"signed_in\":{}}}",
                                if signed_in { "true" } else { "false" }
                            ),
                            latency_ms: started.elapsed().as_millis() as u64,
                        });
                    }
                    if !signed_in {
                        break Err(SessionError::NotSignedIn {
                            provider: provider_label.clone(),
                        });
                    }
                }
                BridgeMessage::Error { message } => break Err(SessionError::Userscript(message)),
                BridgeMessage::Unknown { .. } => continue,
            },
        }
    };

    // Best-effort window close; ignore errors.
    if let Some(win) = app.get_webview_window(&label_for_close) {
        let _ = win.close();
    }

    let _ = sign_in_state;
    outcome
}

/// Spawn the window on the main thread (Tauri requirement) and wire the
/// navigation interceptor.
fn spawn_window(
    app: &AppHandle,
    label: &str,
    url: Url,
    visible: bool,
    init_script: String,
    tx: UnboundedSender<BridgeMessage>,
) -> Result<(), SessionError> {
    let app_clone = app.clone();
    let label = label.to_string();
    let spawn_err: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let spawn_err_clone = spawn_err.clone();

    app.run_on_main_thread(move || {
        let nav_tx = tx.clone();
        let result = WebviewWindowBuilder::new(&app_clone, &label, WebviewUrl::External(url))
            .title("Interview Mode — Webview")
            .visible(visible)
            .inner_size(900.0, 700.0)
            .initialization_script(&init_script)
            .on_navigation(move |target_url| {
                if target_url.scheme() == "interview-bridge" {
                    let _ = nav_tx.send(BridgeMessage::parse(target_url));
                    return false;
                }
                true
            })
            .build();

        if let Err(e) = result {
            *spawn_err_clone.lock().unwrap() = Some(e.to_string());
        }
    })
    .map_err(|e| SessionError::Spawn(e.to_string()))?;

    if let Some(msg) = spawn_err.lock().unwrap().take() {
        return Err(SessionError::Spawn(msg));
    }
    Ok(())
}

pub async fn show_webview(app: AppHandle, visible: bool) -> Result<(), String> {
    let app_clone = app.clone();
    app.run_on_main_thread(move || {
        // Toggle every interview-webview-* window currently open.
        let labels: Vec<String> = app_clone
            .webview_windows()
            .keys()
            .filter(|k| k.starts_with("interview-webview-"))
            .cloned()
            .collect();
        for label in labels {
            if let Some(win) = app_clone.get_webview_window(&label) {
                let _ = if visible { win.show() } else { win.hide() };
            }
        }
    })
    .map_err(|e| e.to_string())
}
