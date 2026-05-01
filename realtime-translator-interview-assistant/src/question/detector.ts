// Heuristic question detection across English, German, Vietnamese.

const EN_WH = [
  'what','whats','whatre',
  'how','hows',
  'why','whys',
  'when','wheres','where',
  'which','who','whose','whom',
  'can','could','would','should','do','does','did','is','are','was','were','will','have','has','had',
  'shall','may','might',
];

const DE_WH = [
  'was','wie','warum','wieso','weshalb','wann','wo','wohin','woher',
  'welche','welcher','welches','wer','wen','wem',
  'kann','könnte','koennte','würde','wuerde','sollte','soll','darf','muss','musst','müssen','muessen',
  'ist','sind','war','waren','hast','hat','haben','wird','werden',
];

const VI_WH = [
  'gì','sao','vì sao','tại sao','khi nào','bao giờ','lúc nào',
  'ở đâu','đâu','nào','ai','của ai',
  'có thể','được không','phải không','đúng không','chưa','rồi chưa',
  'như thế nào','thế nào','ra sao','bao nhiêu','mấy',
];

export type DetectionResult =
  | { isQuestion: false; reason: string }
  | { isQuestion: true; reason: string };

export function detectQuestion(text: string, minLength = 12): DetectionResult {
  const trimmed = text.trim();
  if (!trimmed) return { isQuestion: false, reason: 'empty' };
  if (trimmed.length < minLength) return { isQuestion: false, reason: 'too-short' };

  // Direct '?' at end (English/German/most languages)
  if (/[?？]\s*$/.test(trimmed)) {
    return { isQuestion: true, reason: 'ends-with-question-mark' };
  }

  const lower = trimmed.toLowerCase();
  // First word check + presence anywhere for VI multi-word phrases.
  const firstWord = lower.split(/\s+/)[0]?.replace(/[^\p{L}]/gu, '');

  if (firstWord && (EN_WH.includes(firstWord) || DE_WH.includes(firstWord))) {
    return { isQuestion: true, reason: `wh-word:${firstWord}` };
  }

  for (const phrase of VI_WH) {
    if (lower.includes(phrase)) {
      return { isQuestion: true, reason: `vi-phrase:${phrase}` };
    }
  }

  return { isQuestion: false, reason: 'no-marker' };
}
