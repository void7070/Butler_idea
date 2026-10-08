/**
 * 항목 이름별 내구연수(년). 표준 기준 감가(잔존가치 = 1 − 경과 월수 ÷ (내구연수 × 12))에 쓴다.
 *
 * ⚠️ 예시 값 · 공정위 소비자분쟁해결기준 원문 확인 필요
 *
 * 이름은 itemCatalog의 name(모든 구역 공통)과 맞춘다. 표에 없는 항목은 DEFAULT_LIFESPAN_YEARS.
 * 내구연수는 이 파일 한 곳에만 둔다 (itemCatalog에는 없음). 실제 기준을 확인하면 이 표만 고친다.
 */

export const DEFAULT_LIFESPAN_YEARS = 5;

export const LIFESPANS = {
  벽지: 6,
  실리콘: 5,
  '후드 필터': 8,
  방충망: 5,
  바닥재: 8,
};

/** 항목 이름 → 내구연수(년). 없으면 기본 5년. */
export function lifespanYears(itemName) {
  return LIFESPANS[itemName] ?? DEFAULT_LIFESPAN_YEARS;
}
