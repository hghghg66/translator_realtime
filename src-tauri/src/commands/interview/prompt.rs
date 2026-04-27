//! System prompt + user prompt construction shared across providers.

use super::provider::ProviderConfig;

/// System prompt the LLM is instructed with. Returns a JSON-only response.
pub fn build_system_prompt(cfg: &ProviderConfig) -> String {
    let answer_language_hint = if cfg.answer_language.trim().is_empty() {
        "Reply in the same language as the question.".to_string()
    } else {
        format!(
            "Reply in {} (ISO code: {}).",
            language_label(&cfg.answer_language),
            cfg.answer_language
        )
    };

    let cv_block = if cfg.cv_context.trim().is_empty() {
        String::new()
    } else {
        format!("\n\n# Candidate background / CV\n{}", cfg.cv_context.trim())
    };

    let role_block = if cfg.role_context.trim().is_empty() {
        String::new()
    } else {
        format!(
            "\n\n# Target role / interview context\n{}",
            cfg.role_context.trim()
        )
    };

    format!(
        "You are an interview coach helping the candidate answer questions in real time during a live interview. \
The candidate's mic captures the interviewer's question; you must respond with concise, high-signal coaching.\n\
\n\
## Output rules\n\
1. Respond with a SINGLE JSON object — no markdown, no prose around it.\n\
2. Schema:\n\
   {{\n\
     \"talking_points\": string[],         // 3-5 bullet points the candidate should hit\n\
     \"sample_answer\":  string,           // 2-4 sentence model answer in first person\n\
     \"follow_up_questions\": string[]     // 2-3 plausible follow-ups the interviewer might ask\n\
   }}\n\
3. Keep talking_points short (≤ 14 words each). Sample answer ≤ 80 words.\n\
4. {language_hint}\n\
5. Tailor every point to the candidate's CV/role context below when relevant. Do not invent experience the CV does not claim.\n\
6. If the question is vague or non-interview chatter, still produce a useful answer — never refuse.\n\
{cv_block}{role_block}",
        language_hint = answer_language_hint,
        cv_block = cv_block,
        role_block = role_block,
    )
}

pub fn build_user_prompt(question: &str) -> String {
    format!(
        "Interviewer just asked:\n\n{question}\n\nReturn the JSON object now.",
        question = question.trim()
    )
}

fn language_label(code: &str) -> &'static str {
    match code {
        "en" => "English",
        "vi" => "Vietnamese",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh" => "Chinese",
        "fr" => "French",
        "de" => "German",
        "es" => "Spanish",
        "it" => "Italian",
        "pt" => "Portuguese",
        "ru" => "Russian",
        _ => "the candidate's preferred language",
    }
}
