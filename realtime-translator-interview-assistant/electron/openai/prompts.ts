import { AnswerLanguage, AnswerLength, AnswerLevel, AnswerStyle } from '../ipc.js';

const LENGTH_HINT: Record<AnswerLength, string> = {
  Short: '2-3 sentences, concise and direct.',
  Medium: '4-6 sentences, structured with light reasoning.',
  Detailed: '7-12 sentences with examples, structure, and reasoning.',
};

const LEVEL_HINT: Record<AnswerLevel, string> = {
  Simple: 'very simple words, short clauses, beginner-friendly.',
  A2: 'CEFR A2 vocabulary, common words, present/past tenses mostly.',
  B1: 'CEFR B1 vocabulary, mix of tenses, clear connectors.',
  B2: 'CEFR B2 vocabulary, professional but natural.',
  Professional: 'professional vocabulary, idiomatic where appropriate.',
};

const STYLE_HINT: Record<AnswerStyle, string> = {
  Natural: 'natural, conversational, sounds like a real human candidate.',
  Professional: 'polished, professional, slightly formal.',
  Confident: 'confident, assertive, uses concrete results when relevant.',
  Humble: 'humble, polite, acknowledges learning and team contributions.',
};

const ANSWER_LANG_HINT: Record<AnswerLanguage, string> = {
  Vietnamese: 'tiếng Việt',
  English: 'English',
  German: 'German (Deutsch)',
};

export function buildSystemPrompt(): string {
  return [
    'Bạn là trợ lý phỏng vấn chuyên nghiệp.',
    'Bạn giúp ứng viên chuẩn bị câu trả lời cho câu hỏi phỏng vấn.',
    'Luôn trả về JSON hợp lệ đúng schema được yêu cầu.',
    'Không thêm markdown, không thêm văn bản ngoài JSON.',
  ].join(' ');
}

export function buildAnalyzePrompt(args: {
  question: string;
  questionTranslationVi?: string;
  answerLanguage: AnswerLanguage;
  length: AnswerLength;
  level: AnswerLevel;
  style: AnswerStyle;
}): string {
  const { question, questionTranslationVi, answerLanguage, length, level, style } = args;
  const trans = questionTranslationVi ? `\nBản dịch tiếng Việt sẵn có: "${questionTranslationVi}"` : '';
  return [
    `Câu hỏi phỏng vấn (gốc): "${question}"${trans}`,
    '',
    'Hãy phân tích câu hỏi và soạn câu trả lời gợi ý theo các yêu cầu sau:',
    `- Ngôn ngữ câu trả lời: ${ANSWER_LANG_HINT[answerLanguage]}.`,
    `- Độ dài: ${LENGTH_HINT[length]}`,
    `- Trình độ ngôn ngữ: ${LEVEL_HINT[level]}`,
    `- Phong cách: ${STYLE_HINT[style]}`,
    '',
    'Trả về JSON với schema chính xác:',
    '{',
    '  "question_meaning_vi": "ý nghĩa câu hỏi bằng tiếng Việt, 1-2 câu",',
    '  "interviewer_intent_vi": "điều người phỏng vấn thực sự muốn biết, bằng tiếng Việt",',
    '  "suggested_answer": "câu trả lời gợi ý theo ngôn ngữ/độ dài/phong cách yêu cầu",',
    '  "answer_translation_vi": "bản dịch tiếng Việt nếu suggested_answer là tiếng Anh hoặc tiếng Đức, ngược lại null",',
    '  "useful_phrases": [{"phrase": "...", "meaning_vi": "..."}, ... 3-5 cụm]',
    '}',
  ].join('\n');
}

export function buildImprovePrompt(args: {
  question: string;
  currentAnswer: string;
  answerLanguage: AnswerLanguage;
  length: AnswerLength;
  level: AnswerLevel;
  style: AnswerStyle;
}): string {
  const { question, currentAnswer, answerLanguage, length, level, style } = args;
  return [
    `Câu hỏi: "${question}"`,
    `Câu trả lời hiện tại: "${currentAnswer}"`,
    '',
    'Hãy CẢI THIỆN câu trả lời này: thêm ví dụ cụ thể, làm rõ luận điểm, giữ ngôn ngữ tự nhiên.',
    `- Ngôn ngữ: ${ANSWER_LANG_HINT[answerLanguage]}.`,
    `- Độ dài: ${LENGTH_HINT[length]}`,
    `- Trình độ: ${LEVEL_HINT[level]}`,
    `- Phong cách: ${STYLE_HINT[style]}`,
    '',
    'Trả về JSON cùng schema như analyze.',
  ].join('\n');
}

export function buildSimplifyPrompt(args: {
  question: string;
  currentAnswer: string;
  answerLanguage: AnswerLanguage;
}): string {
  const { question, currentAnswer, answerLanguage } = args;
  return [
    `Câu hỏi: "${question}"`,
    `Câu trả lời hiện tại: "${currentAnswer}"`,
    '',
    'Hãy ĐƠN GIẢN HOÁ câu trả lời: dùng từ ngữ dễ hiểu hơn, câu ngắn hơn, giữ ý chính.',
    `- Ngôn ngữ: ${ANSWER_LANG_HINT[answerLanguage]}.`,
    '- Trình độ ngôn ngữ: A2-B1.',
    '- Phong cách: Natural.',
    '',
    'Trả về JSON cùng schema như analyze.',
  ].join('\n');
}
