// 창 28: 한글이 섞인 문장에서 숫자·날짜·시각·금액·D-day 부분만 숫자 글꼴(.num)로 쓰기 위한 분리.
// lib 함수가 만든 문구는 그대로 두고, 화면에서만 조각으로 나눈다(이어 붙이면 원래 문자열).

// D-DAY · D-5 · D+3 / 2024-03-02 · 10:56:34 · 320,000원 · 60% · 0/2
const NUM_RE = /D-DAY|D[+-]\d+|\d(?:[\d,.:/-]*\d)?(?:%|원)?/g;

/** 문자열 → [{ text, num }] 조각. 빈 값은 []. */
export function splitNum(value) {
  const text = value == null ? '' : String(value);
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(NUM_RE)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), num: false });
    parts.push({ text: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), num: false });
  return parts;
}
