//! `interview-bridge://` URL parsing.
//!
//! The userscripts navigate to `interview-bridge://<path>?<query>` to
//! signal events back to Rust. The on-navigation hook intercepts those
//! URLs, parses them with this module, and forwards a [`BridgeMessage`]
//! over a channel.

use url::Url;

#[derive(Debug, Clone)]
pub enum BridgeMessage {
    /// Final assistant response payload (raw text — may or may not be JSON).
    Result { provider: String, data: String },
    /// Login status report from the userscript.
    LoginStatus { provider: String, signed_in: bool },
    /// Userscript hit a hard error (no composer, timeout, etc.).
    Error { message: String },
    /// Anything we couldn't classify — surfaced for logging/debugging.
    Unknown { raw: String },
}

impl BridgeMessage {
    pub fn parse(url: &Url) -> Self {
        if url.scheme() != "interview-bridge" {
            return BridgeMessage::Unknown {
                raw: url.to_string(),
            };
        }

        // Accept both `interview-bridge://result?...` (host == "result")
        // and `interview-bridge:///result?...` (path == "/result").
        let kind = if !url.host_str().unwrap_or("").is_empty() {
            url.host_str().unwrap_or("").to_string()
        } else {
            url.path().trim_start_matches('/').to_string()
        };

        let qmap: std::collections::HashMap<String, String> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();

        match kind.as_str() {
            "result" => BridgeMessage::Result {
                provider: qmap.get("provider").cloned().unwrap_or_default(),
                data: qmap.get("data").cloned().unwrap_or_default(),
            },
            "login-status" => BridgeMessage::LoginStatus {
                provider: qmap.get("provider").cloned().unwrap_or_default(),
                signed_in: qmap.get("signed_in").map(|v| v == "true").unwrap_or(false),
            },
            "error" => BridgeMessage::Error {
                message: qmap
                    .get("message")
                    .cloned()
                    .unwrap_or_else(|| "unknown error".to_string()),
            },
            _ => BridgeMessage::Unknown {
                raw: url.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> BridgeMessage {
        BridgeMessage::parse(&Url::parse(s).unwrap())
    }

    #[test]
    fn parses_result() {
        let msg = parse("interview-bridge://result?provider=chatgpt&data=hello");
        match msg {
            BridgeMessage::Result { provider, data } => {
                assert_eq!(provider, "chatgpt");
                assert_eq!(data, "hello");
            }
            _ => panic!("expected Result"),
        }
    }

    #[test]
    fn parses_login_status() {
        let msg = parse("interview-bridge://login-status?provider=claude&signed_in=true");
        match msg {
            BridgeMessage::LoginStatus {
                provider,
                signed_in,
            } => {
                assert_eq!(provider, "claude");
                assert!(signed_in);
            }
            _ => panic!("expected LoginStatus"),
        }
    }

    #[test]
    fn parses_error() {
        let msg = parse("interview-bridge://error?message=Not%20signed%20in");
        match msg {
            BridgeMessage::Error { message } => assert_eq!(message, "Not signed in"),
            _ => panic!("expected Error"),
        }
    }

    #[test]
    fn handles_url_decoded_data() {
        let msg = parse("interview-bridge://result?provider=gemini&data=a%20b%20%7B%7D");
        match msg {
            BridgeMessage::Result { data, .. } => assert_eq!(data, "a b {}"),
            _ => panic!("expected Result"),
        }
    }

    #[test]
    fn unknown_kind_falls_back() {
        let msg = parse("interview-bridge://wat?x=1");
        matches!(msg, BridgeMessage::Unknown { .. });
    }
}
