/**
 * 보증금 공제 근거 계산 (순수 함수, AI 사용 안 함). progress.md 창 7.
 *
 * 비율 계산이 아니라 **항목별 부담자**: 'tenant'(임차인) | 'landlord'(임대인) | 'hold'(보류).
 * - 기본 부담자: evidence 'low' → hold / 퇴거 상태 minor → landlord(자연 마모 후보) / 그 외 tenant
 * - 임차인 부담 금액: ① 적용되는 템플릿 특약(applyMode 'auto')의 규칙 ② 없으면 표준 기준
 *   표준 = 비용 × (1 − 경과 월수 ÷ (내구연수 × 12)), 100원 단위 반올림
 * - 고정 금액 특약(fixed_fee)은 별도 줄(fees)로 임차인 청구
 * - 자유 문장 특약(manual)은 manualClauses로만 반환 (금액 반영 안 함)
 * - 임대인 부담 항목 비용 합 → landlordTotal (수선비 장부)
 * - 조건부 특약(rule.condition, 예: 반려동물 손상, 창 25): 원인은 코드가 판단하지 않는다. 대상 항목에
 *   conditionalClauses로 "해당 가능"만 붙이고, 임대인이 항목마다 conditionClauseNo로 "조건 해당"을 확인하면
 *   근거가 그 특약이 된다(금액은 rule.kind 'standard' → 표준 금액 그대로). full_cost 특약이 있으면 그쪽이 우선.
 * 사람이 고른 부담자를 계산할 뿐, 책임 여부를 판단하지 않는다.
 */
import { lifespanYears } from '../domain/lifespans.js';

export const PAYERS = ['tenant', 'landlord', 'hold'];
export const SMALL_BULK_THRESHOLD = 50000;

/** 100원 단위 반올림 */
export const round100 = (n) => Math.round(n / 100) * 100;

/** 'YYYY-MM-DD...' 두 날짜 사이의 만 개월 수 (음수면 0). */
export function monthsBetween(from, to) {
  const [y1, m1, d1] = String(from).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(to).slice(0, 10).split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(0, months);
}

/** 기본 부담자 (diff change 기준). */
export function defaultPayer(change) {
  if (change.evidence === 'low') return 'hold';
  if (change.to === 'minor') return 'landlord';
  return 'tenant';
}

/** 잔존가치 비율 (0~1). */
export function residualRatio(elapsedMonths, years) {
  return Math.min(1, Math.max(0, 1 - elapsedMonths / (years * 12)));
}

/** 이 항목에 자동 적용되는 금액 특약(full_cost). 없으면 null. */
function findItemClause(clauses, itemName, elapsedMonths) {
  for (const c of clauses) {
    if (c.applyMode !== 'auto' || !c.rule) continue;
    const { rule } = c;
    if (rule.kind !== 'full_cost' || rule.payer !== 'tenant') continue;
    if (!(rule.targetItemNames ?? []).includes(itemName)) continue;
    if (rule.elapsed) {
      const { maxMonths, inclusive } = rule.elapsed;
      const within = inclusive ? elapsedMonths <= maxMonths : elapsedMonths < maxMonths;
      if (!within) continue;
    }
    return c;
  }
  // 조건부 'standard' 규칙(PET_DAMAGE 등)은 원인을 자동 판단하지 않는다 → conditionalClausesFor + 임대인 확인 (창 25)
  return null;
}

/**
 * 이 항목이 대상인 조건부 특약(rule.condition 있음, applyMode 'auto', 임차인 부담) 목록 (창 25).
 * 해당 여부는 판단하지 않고 "해당 가능" 안내용으로만 돌려준다.
 * @returns {Array<{clauseNo:number, title:string|null, text:string, condition:string}>}
 */
export function conditionalClausesFor(clauses, itemName) {
  return (clauses ?? [])
    .filter(
      (c) =>
        c.applyMode === 'auto' &&
        c.rule?.condition &&
        c.rule.payer === 'tenant' &&
        (c.rule.targetItemNames ?? []).includes(itemName)
    )
    .map((c) => ({ clauseNo: c.clauseNo, title: c.templateTitle ?? null, text: c.text, condition: c.rule.condition }));
}

/**
 * @param {object} input
 * @param {Array} input.changes      diffBaseline().changes (itemCode, zone, name, tier, from, to, evidence)
 * @param {object|null} input.lease  getLeaseByUnitId() 결과 ({ deposit, startDate, clauses[] }). 없으면 특약·보증금 없음
 * @param {Object<string,{estimateCost?:number|null, payer?:string|null, conditionClauseNo?:number|null}>} [input.items] 항목 코드별 입력
 * @param {string} input.moveInDate  경과 월수 시작 (계약 시작일)
 * @param {string} input.moveOutDate 경과 월수 끝 (퇴거 리포트 날짜)
 */
export function computeSettlement({ changes, lease = null, items = {}, moveInDate, moveOutDate }) {
  const clauses = lease?.clauses ?? [];
  const elapsedMonths = monthsBetween(moveInDate, moveOutDate);

  const rows = changes.map((ch) => {
    const input = items[ch.itemCode] ?? {};
    const estimateCost = input.estimateCost ?? null;
    const dflt = defaultPayer(ch);
    const payer = PAYERS.includes(input.payer) ? input.payer : dflt;
    const years = lifespanYears(ch.name);
    const cost = estimateCost ?? 0;
    const fullCost = findItemClause(clauses, ch.name, elapsedMonths);
    const conditionalClauses = conditionalClausesFor(clauses, ch.name);
    const conditionClauseNo = input.conditionClauseNo ?? null;
    // 임대인이 확인한 조건부 특약 (그 항목의 조건부 특약일 때만, full_cost 특약이 없을 때만)
    const condition = fullCost ? null : conditionalClauses.find((c) => c.clauseNo === conditionClauseNo) ?? null;

    let basis = null;
    let tenantAmount = 0;
    if (payer === 'tenant') {
      const ratio = residualRatio(elapsedMonths, years);
      const residual = Math.round(ratio * 10000) / 10000; // 표시용 (소수 4자리)
      const stdAmount = round100(cost * ratio);
      if (fullCost) {
        basis = { type: 'clause', clauseNo: fullCost.clauseNo, stdAmount, residual };
        tenantAmount = cost;
      } else if (condition) {
        basis = { type: 'clause', clauseNo: condition.clauseNo, kind: 'standard', stdAmount, residual };
        tenantAmount = stdAmount;
      } else {
        basis = { type: 'standard', clauseNo: null, stdAmount, residual };
        tenantAmount = stdAmount;
      }
    }

    return {
      itemCode: ch.itemCode,
      zone: ch.zone,
      name: ch.name,
      tier: ch.tier,
      from: ch.from,
      to: ch.to,
      evidence: ch.evidence,
      lifespanYears: years,
      estimateCost,
      defaultPayer: dflt,
      payer,
      tenantAmount,
      landlordAmount: payer === 'landlord' ? cost : 0,
      holdAmount: payer === 'hold' ? cost : 0,
      basis,
      conditionalClauses,
      conditionClauseNo,
      fullCostClauseNo: fullCost?.clauseNo ?? null, // 조건부 특약보다 먼저 적용되는 full_cost 특약 (창 25)
    };
  });

  const fees = clauses
    .filter((c) => c.applyMode === 'auto' && c.rule?.kind === 'fixed_fee' && c.rule.payer === 'tenant')
    .map((c) => ({
      clauseNo: c.clauseNo,
      templateCode: c.templateCode ?? null,
      title: c.templateTitle ?? null,
      text: c.text,
      payer: 'tenant',
      amount: c.rule.amount,
    }));

  const pick = (mode) =>
    clauses.filter((c) => c.applyMode === mode).map((c) => ({ clauseNo: c.clauseNo, text: c.text }));

  const sum = (arr, key) => arr.reduce((s, r) => s + r[key], 0);
  const tenantTotal = sum(rows, 'tenantAmount') + sum(fees, 'amount');
  const deposit = lease?.deposit ?? null;

  return {
    elapsedMonths,
    items: rows,
    fees,
    manualClauses: pick('manual'),
    displayClauses: pick('display'),
    totals: {
      tenantTotal,
      landlordTotal: sum(rows, 'landlordAmount'),
      holdTotal: sum(rows, 'holdAmount'),
      deposit,
      depositReturn: deposit == null ? null : deposit - tenantTotal,
    },
  };
}

/**
 * 소액 일괄 처리: 비용이 기준 이하인 항목을 임대인 부담으로. 비용 미입력(null) 항목은 그대로.
 * @param {Array<{itemCode:string, estimateCost:number|null, payer:string}>} items
 * @returns {Array} 새 배열 (입력은 바꾸지 않음)
 */
export function applySmallBulk(items, threshold = SMALL_BULK_THRESHOLD) {
  return items.map((it) =>
    it.estimateCost != null && it.estimateCost <= threshold ? { ...it, payer: 'landlord' } : it
  );
}
