/**
 * 계약 특약 템플릿 5개와 정산 규칙 구조.
 * 기준 적용 순서: 계약 특약 > 입주 기준선 > 표준 기준 (progress.md).
 *
 * 규칙(rule)은 정산 계산(창 7 settlement.js)이 읽는 데이터일 뿐이고, 여기서는 계산하지 않는다.
 * - applyMode 'auto'    : 정산에 자동 적용
 * - applyMode 'display' : 템플릿이지만 금액에 반영하지 않고 표시만
 * - 템플릿 없는 자유 문장은 'manual' ("수동 확인 필요")
 *
 * rule 필드
 * - kind: 'full_cost'(복구 비용 전액) | 'fixed_fee'(고정 금액) | 'standard'(표준 기준) | 'display'
 * - payer: 'tenant' | 'none'
 * - targetItemNames: 대상 항목 이름(itemCatalog의 name, 모든 구역). 없으면 항목과 무관
 * - elapsed: { from: 'lease_start', to: 'move_out', maxMonths, inclusive } — 경과 월수 조건
 * - condition: 'pet_damage' 등 정산 화면에서 사람이 확인할 조건
 */

export const APPLY_MODES = ['auto', 'display', 'manual'];

const TEMPLATES = [
  {
    code: 'WALLPAPER_FLOOR_FULL',
    title: '도배·장판 기간 내 훼손 전액 부담',
    applyMode: 'auto',
    defaultParams: { withinMonths: 24 },
    text: (p) => `입주 후 ${p.withinMonths}개월 이내 벽지·바닥재 훼손 시 임차인이 복구 비용 전액을 부담한다.`,
    rule: (p) => ({
      kind: 'full_cost',
      payer: 'tenant',
      targetItemNames: ['벽지', '바닥재'],
      elapsed: { from: 'lease_start', to: 'move_out', maxMonths: p.withinMonths, inclusive: true },
    }),
  },
  {
    code: 'CLEANING_FEE',
    title: '퇴거 청소비',
    applyMode: 'auto',
    defaultParams: { amount: 200000 },
    text: (p) => `퇴거 시 청소비 ${p.amount.toLocaleString('ko-KR')}원은 임차인이 부담한다.`,
    rule: (p) => ({ kind: 'fixed_fee', payer: 'tenant', amount: p.amount }),
  },
  {
    code: 'PET_DAMAGE',
    title: '반려동물 손상',
    applyMode: 'auto',
    defaultParams: {},
    text: () => '반려동물로 인한 문·문틀, 바닥재, 벽지 손상은 표준 기준에 따라 임차인이 부담한다.',
    rule: () => ({
      kind: 'standard',
      payer: 'tenant',
      targetItemNames: ['문·문틀', '바닥재', '벽지'],
      condition: 'pet_damage',
    }),
  },
  {
    code: 'NAIL_HOLES_ALLOW',
    title: '못 자국 허용',
    applyMode: 'display',
    defaultParams: { maxCount: 5 },
    text: (p) => `벽의 못 자국은 ${p.maxCount}개까지 임차인이 부담하지 않는다.`,
    rule: (p) => ({ kind: 'display', payer: 'none', maxNailHoles: p.maxCount }),
  },
  {
    code: 'AIRCON_CLEANING',
    title: '에어컨 청소',
    applyMode: 'display',
    defaultParams: {},
    text: () => '퇴거 시 에어컨 청소는 임차인이 한다.',
    rule: () => ({ kind: 'display', payer: 'tenant', task: 'aircon_cleaning' }),
  },
];

const byCode = new Map(TEMPLATES.map((t) => [t.code, t]));

/** 템플릿 목록 (API/화면용 직렬화 가능 형태). */
export const CLAUSE_TEMPLATES = TEMPLATES.map((t) => ({
  code: t.code,
  title: t.title,
  applyMode: t.applyMode,
  defaultParams: { ...t.defaultParams },
  defaultText: t.text(t.defaultParams),
  rule: t.rule(t.defaultParams),
}));

/** 코드로 템플릿 찾기. 없으면 null. */
export function getClauseTemplate(code) {
  return CLAUSE_TEMPLATES.find((t) => t.code === code) ?? null;
}

/**
 * 템플릿 + 파라미터 → { text, rule }. 알 수 없는 코드면 throw.
 * 파라미터는 기본값 위에 덮어쓴다 (예: CLEANING_FEE { amount: 150000 }).
 */
export function buildClause(code, params = {}) {
  const t = byCode.get(code);
  if (!t) throw new Error(`알 수 없는 특약 템플릿: ${code}`);
  const p = { ...t.defaultParams, ...params };
  return { text: t.text(p), rule: t.rule(p) };
}

/** 특약의 적용 방식. 템플릿 없음(자유 문장) 또는 알 수 없는 코드 → 'manual'. */
export function clauseApplyMode(templateCode) {
  return byCode.get(templateCode)?.applyMode ?? 'manual';
}
