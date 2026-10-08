// 공통 컴포넌트(components/ui/)와 화면 헬퍼가 함께 쓰는 색 클래스 (창 21, 디자인 토큰 = style.css @theme).
// 목업 ../mockup/index.html 의 .dday / .pill / .card.edge-* / .grade / .banner 와 같은 색.

/** D-day 칩 (.dday) */
export const DDAY_TONE = {
  crit: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  calm: 'bg-surface-2 text-ink-2',
};

/** 알약 뱃지 (.pill) */
export const PILL_TONE = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  seal: 'bg-seal-soft text-seal',
  acc: 'bg-accent-soft text-accent',
  plain: 'bg-surface-2 text-ink-2',
  dark: 'bg-ink text-surface',
};

/** 카드 왼쪽 색 테두리 (.card.edge-*) */
export const EDGE_TONE = {
  crit: 'border-l-4 border-l-crit',
  warn: 'border-l-4 border-l-warn',
  calm: 'border-l-4 border-l-line',
};

/** 등급 칩 (.grade .g-A~E) */
export const GRADE_TONE = {
  A: 'bg-ok-soft text-ok',
  B: 'bg-accent-soft text-accent',
  C: 'bg-warn-soft text-warn',
  D: 'bg-crit-soft text-crit',
  E: 'bg-crit-soft text-crit',
};

/** 배너 바탕 (.banner.*) — 굵은 글씨(b) 색은 BANNER_STRONG */
export const BANNER_TONE = {
  crit: 'bg-crit-soft',
  ok: 'bg-ok-soft',
  warn: 'bg-warn-soft',
  seal: 'bg-seal-soft',
  plain: 'bg-surface-2',
};

export const BANNER_STRONG = {
  crit: '[&_b]:text-crit',
  ok: '[&_b]:text-ok',
  warn: '[&_b]:text-warn',
  seal: '[&_b]:text-seal',
  plain: '',
};
