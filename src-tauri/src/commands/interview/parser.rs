//! Tolerant JSON extraction from LLM responses.
//!
//! Models often wrap JSON in ```json fences, prepend a chatty preamble,
//! or trail with explanatory text. This module extracts the first balanced
//! `{ ... }` block and parses it.

use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub struct ParsedSuggestion {
    pub talking_points: Vec<String>,
    pub sample_answer: String,
    pub follow_up_questions: Vec<String>,
}

/// Parse the model's free-form text into a `ParsedSuggestion`. Best-effort:
/// missing/typo'd keys default to empty rather than failing.
pub fn parse(raw: &str) -> Result<ParsedSuggestion, String> {
    let json_str = extract_first_json_object(raw)
        .ok_or_else(|| "No JSON object found in model response".to_string())?;
    let value: Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {e}"))?;

    Ok(ParsedSuggestion {
        talking_points: take_string_array(&value, "talking_points"),
        sample_answer: take_string(&value, "sample_answer"),
        follow_up_questions: take_string_array(&value, "follow_up_questions"),
    })
}

/// Walk `raw` looking for the first balanced `{...}` substring, ignoring
/// braces inside string literals.
fn extract_first_json_object(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut start: Option<usize> = None;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;

    for (i, &b) in bytes.iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' => {
                if start.is_none() {
                    start = Some(i);
                }
                depth += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(s) = start {
                        return Some(raw[s..=i].to_string());
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn take_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn take_string_array(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_clean_json() {
        let raw = r#"{
            "talking_points": ["a", "b"],
            "sample_answer": "answer",
            "follow_up_questions": ["x"]
        }"#;
        let p = parse(raw).unwrap();
        assert_eq!(p.talking_points, vec!["a", "b"]);
        assert_eq!(p.sample_answer, "answer");
        assert_eq!(p.follow_up_questions, vec!["x"]);
    }

    #[test]
    fn extracts_from_fenced() {
        let raw = "Sure, here you go:\n```json\n{\"talking_points\": [\"a\"], \"sample_answer\": \"b\", \"follow_up_questions\": []}\n```\nLet me know.";
        let p = parse(raw).unwrap();
        assert_eq!(p.talking_points, vec!["a"]);
        assert_eq!(p.sample_answer, "b");
        assert!(p.follow_up_questions.is_empty());
    }

    #[test]
    fn skips_braces_in_strings() {
        let raw = r#"{"sample_answer":"a } b","talking_points":[],"follow_up_questions":[]}"#;
        let p = parse(raw).unwrap();
        assert_eq!(p.sample_answer, "a } b");
    }

    #[test]
    fn missing_keys_default_empty() {
        let raw = r#"{"sample_answer": "ok"}"#;
        let p = parse(raw).unwrap();
        assert!(p.talking_points.is_empty());
        assert_eq!(p.sample_answer, "ok");
        assert!(p.follow_up_questions.is_empty());
    }

    #[test]
    fn no_json_returns_err() {
        assert!(parse("just text").is_err());
    }
}
