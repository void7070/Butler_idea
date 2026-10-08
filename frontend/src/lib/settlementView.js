// 정산 화면("보증금 공제 근거") 표시용 순수 헬퍼. progress.md 창 8.
// 백엔드 GET/POST/PATCH /api/settlements 응답의 settlement를 그대로 쓴다. 금액 계산은 백엔드(lib/settlement.js)가 한다.
// 여기서는 문구·숫자 형식·입력 파싱만 정한다. 책임·공제 판단은 하지 않는다.

export const PAYER_OPTIONS = [
  { value: 'tenant', label: '임차인 부담' },
  { value: 'landlord', label: '임대인 부담' },
  { value: 'hold', label: '보류' },
];

export const SMALL_BULK_THRESHOLD = 50000;

export const DISCLAIMERS = [
  '법률 자문이 아닌 참고용 계산입니다. 최종 금액은 임대인과 임차인의 합의로 확정됩니다.',
  '특약 효력은 법률 검토가 필요할 수 있습니다.',
];

/** 480000 → '480,000원', null → '-' */
export function formatWon(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toLocaleString('ko-KR')}원`;
}

/** 소액 일괄 버튼 문구 (5만 원 → '5만 원'). */
export function bulkSmallLabel(threshold = SMALL_BULK_THRESHOLD) {
  const amount = threshold % 10000 === 0 ? `${threshold / 10000}만 원` : formatWon(threshold);
  return `${amount} 이하 항목은 임대인 부담으로 처리`;
}

/**
 * 라우트 query → POST /api/settlements 본문. 잘못되면 null.
 * @param {{moveInReportId?:string, moveOutReportId?:string}} query
 */
export function settlementRequest(query) {
  const moveInReportId = Number(query?.moveInReportId);
  const moveOutReportId = Number(query?.moveOutReportId);
  const ok = (n) => Number.isInteger(n) && n > 0;
  return ok(moveInReportId) && ok(moveOutReportId) ? { moveInReportId, moveOutReportId } : null;
}

/**
 * 특약 번호 → 요약 문구. 템플릿 제목이 있으면 제목, 없으면 문장(길면 자름).
 * @param {object|null} lease GET /api/units/:id/lease 의 lease (못 불러오면 null)
 */
export function clauseSummary(lease, clauseNo, maxLength = 30) {
  const clause = lease?.clauses?.find((c) => c.clauseNo === clauseNo);
  if (!clause) return '';
  if (clause.templateTitle) return clause.templateTitle;
  const text = clause.text ?? '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** 잔존 비율 0.6 → '60%' */
export function residualPercent(residual) {
  return `${Math.round((residual ?? 0) * 100)}%`;
}

/**
 * 항목 카드의 금액 영역.
 * - 임차인 부담: 금액 + 적용 기준(특약 제n항 (요약) / 표준 기준 · 잔존 n%), 특약이면 표준 참고 금액
 * - 임대인 부담: '임대인 부담 → 수선비 장부 n원'
 * - 보류: 견적만
 * @returns {{ payer, amountText, basisText, referenceText, noteText }}
 */
export function itemAmountView(item, lease = null) {
  const hasCost = item.estimateCost != null;
  const view = { payer: item.payer, amountText: '', basisText: '', referenceText: '', noteText: '' };

  if (item.payer === 'tenant') {
    view.amountText = formatWon(item.tenantAmount);
    const b = item.basis;
    if (b?.type === 'clause' && b.kind === 'standard') {
      // 임대인이 "특약 조건 해당"을 확인한 조건부 특약 (창 25) — 금액은 표준 기준 그대로
      const summary = b.clause?.title ?? clauseSummary(lease, b.clauseNo);
      view.basisText = `적용 기준: 계약 특약 제${b.clauseNo}항${summary ? ` (${summary})` : ''} · 표준 기준 금액`;
      view.referenceText = `표준 기준 · 잔존 ${residualPercent(b.residual)}`;
    } else if (b?.type === 'clause') {
      const summary = clauseSummary(lease, b.clauseNo);
      view.basisText = `적용 기준: 계약 특약 제${b.clauseNo}항${summary ? ` (${summary})` : ''}`;
      view.referenceText = `참고: 표준 기준 ${formatWon(b.stdAmount)}`;
    } else if (b) {
      view.basisText = `적용 기준: 표준 기준 · 잔존 ${residualPercent(b.residual)}`;
    }
    if (!hasCost) view.noteText = '견적 금액을 입력하면 계산됩니다.';
  } else if (item.payer === 'landlord') {
    view.amountText = `임대인 부담 → 수선비 장부 ${formatWon(hasCost ? item.landlordAmount : null)}`;
    if (!hasCost) view.noteText = '견적 금액을 입력하세요.';
  } else {
    view.amountText = `보류 · 견적 ${hasCost ? formatWon(item.estimateCost) : '미입력'}`;
  }
  return view;
}

/** 조건부 특약 조건 이름 (rule.condition → 화면 문구). */
export const CONDITION_LABELS = { pet_damage: '반려동물' };

/**
 * 조건부 특약 안내 + 체크 상자 (창 25). 원인은 코드가 판단하지 않고 임대인이 체크한다.
 * full_cost 특약(fullCostClauseNo)이 먼저 적용되는 항목은 안내만 하고 체크 상자를 막는다.
 * @returns {Array<{ key, clauseNo, noticeText, checkboxLabel, checked, blocked }>}
 */
export function conditionClauseViews(item) {
  const prior = item?.fullCostClauseNo ?? null;
  return (item?.conditionalClauses ?? []).map((c) => {
    const label = CONDITION_LABELS[c.condition] ?? c.title ?? '조건';
    return {
      key: `condition-${c.clauseNo}`,
      clauseNo: c.clauseNo,
      noticeText:
        prior != null
          ? `${label} 특약 제${c.clauseNo}항도 해당 가능 · 제${prior}항이 먼저 적용됨`
          : `${label} 특약 제${c.clauseNo}항 해당 가능 · 원인 확인 필요`,
      checkboxLabel: `이 손상은 특약 조건(${label})에 해당함`,
      checked: item.conditionClauseNo === c.clauseNo,
      blocked: prior != null,
    };
  });
}

/** 체크 상자 → PATCH 본문. 해제하면 null. */
export function conditionPatch(clauseNo, checked) {
  return { conditionClauseNo: checked ? clauseNo : null };
}

/** 고정 금액 특약 줄 (청소비 등). */
export function feeRow(fee) {
  return {
    key: `fee-${fee.clauseNo}`,
    title: fee.title ?? '고정 금액 특약',
    basisText: `적용 기준: 계약 특약 제${fee.clauseNo}항`,
    amountText: formatWon(fee.amount),
    text: fee.text,
  };
}

/** 자유 문장 특약 → "수동 확인 필요" 안내 상자. */
export function manualNotice(clause) {
  return { key: `manual-${clause.clauseNo}`, title: `수동 확인 필요 · 특약 제${clause.clauseNo}항`, text: clause.text };
}

/** 합계 영역. 보류 금액은 합계에 넣지 않고 따로 안내한다. */
export function totalsView(totals) {
  const t = totals ?? {};
  return {
    rows: [
      { key: 'tenant', label: '임차인 청구 합계', value: formatWon(t.tenantTotal ?? 0) },
      {
        key: 'return',
        label: '보증금 반환 예정',
        value: t.depositReturn == null ? '계약 정보 없음' : formatWon(t.depositReturn),
        sub: t.deposit == null ? '' : `보증금 ${formatWon(t.deposit)} − 임차인 청구 ${formatWon(t.tenantTotal ?? 0)}`,
      },
      { key: 'landlord', label: '임대인 부담 → 수선비 장부', value: formatWon(t.landlordTotal ?? 0) },
    ],
    holdText: t.holdTotal > 0 ? `보류 ${formatWon(t.holdTotal)}은 합계에 넣지 않았습니다.` : '',
  };
}

/**
 * 견적 입력 문자열 → PATCH estimateCost. '' → null(견적 지우기).
 * 콤마·공백·'원'은 무시한다. 0 이상 정수만 허용.
 * @returns {{ ok:true, value:number|null } | { ok:false, error:string }}
 */
export function parseCostInput(input) {
  const s = String(input ?? '').replace(/[,\s원]/g, '');
  if (s === '') return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, error: '견적 금액은 0 이상의 숫자(원)로 입력하세요.' };
  return { ok: true, value: Number(s) };
}

/** 소액 일괄 처리 결과 안내. */
export function bulkSmallResult(changedItemCodes, items = []) {
  if (!changedItemCodes?.length) return '바뀐 항목이 없습니다.';
  const names = changedItemCodes.map((code) => {
    const it = items.find((i) => i.itemCode === code);
    return it ? `${it.zone} ${it.name}` : code;
  });
  return `${names.join(', ')} → 임대인 부담으로 바꿨습니다.`;
}
