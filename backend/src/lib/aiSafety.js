/**
 * AI 응답 금지 표현 필터 (순수 함수).
 * AI는 법적 판단/책임 단정/보증금 공제/소송·판례 표현을 하면 안 되므로,
 * 응답에 섞여 들어온 해당 표현을 제거한다. (프롬프트 1차 방어 + 코드 2차 방어)
 */

export const FORBIDDEN_KEYWORDS = [
  '법적 책임',
  '법적으로',
  '보증금 공제',
  '소송',
  '판례',
  '손해배상',
  '과실 책임',
  '배상 책임',
];

function hasForbidden(text) {
  return FORBIDDEN_KEYWORDS.some((k) => text.includes(k));
}

/** 문장 단위로 나눠 금지 표현이 포함된 문장을 제거한다. */
export function sanitizeText(text = '') {
  if (typeof text !== 'string') return '';
  return text
    .split(/(?<=[.!?。\n])/) // 구분자를 앞 문장에 붙여 분리
    .filter((s) => !hasForbidden(s))
    .join('')
    .trim();
}

/** 금지 표현이 든 항목을 제거한 문자열 배열. */
export function sanitizeList(arr = []) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => typeof s === 'string' && !hasForbidden(s));
}

/** 가이드 객체 전체를 정화한다. */
export function sanitizeGuide(guide) {
  return {
    summary: sanitizeText(guide.summary),
    actionCards: (guide.actionCards ?? [])
      .map((c) => ({ title: sanitizeText(c.title), detail: sanitizeText(c.detail) }))
      .filter((c) => c.title || c.detail),
    requiredDocuments: sanitizeList(guide.requiredDocuments),
    cautionPhrases: sanitizeList(guide.cautionPhrases),
    opinionDraft: sanitizeText(guide.opinionDraft),
  };
}
