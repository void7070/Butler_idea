/**
 * 점검 유형 정의. 유형 → 한글 라벨 + 점검 플로우(baseline/whole/issue) 매핑.
 * - baseline: 입주 전/퇴거 전/퇴거 후 → 항목 코드 카탈로그 + 4단계 상태, 이상 항목만 기록
 * - whole: 정기 → 공간별 전체 점검
 * - issue: 긴급/수리 전/수리 후 → 문제 항목 점검
 */
export const INSPECTION_TYPES = {
  move_in: { label: '입주 전 점검', flow: 'baseline' },
  periodic: { label: '정기 점검', flow: 'whole' },
  move_out_pre: { label: '퇴거 전 점검', flow: 'baseline' },
  move_out_post: { label: '퇴거 후 점검', flow: 'baseline' },
  emergency: { label: '긴급 점검', flow: 'issue' },
  repair_pre: { label: '수리 전 점검', flow: 'issue' },
  repair_post: { label: '수리 후 점검', flow: 'issue' },
};

export const INSPECTION_TYPE_CODES = Object.keys(INSPECTION_TYPES);

/** 유형 코드로 플로우(baseline/whole/issue)를 구한다. 알 수 없는 유형이면 throw. */
export function flowForType(type) {
  const entry = INSPECTION_TYPES[type];
  if (!entry) throw new Error(`알 수 없는 점검 유형: ${type}`);
  return entry.flow;
}

export function labelForType(type) {
  return INSPECTION_TYPES[type]?.label ?? type;
}
