/**
 * 분쟁 대비 증빙 패키지 조립 (순수 함수, 창 19). AI 사용 안 함.
 *
 * 이미 있는 기록(계약·특약, 입주/퇴거 리포트 스냅샷, 입주 제보, 정산 본문, 링크, 해시 검증)을
 * 한 묶음으로 모은다. 확정된 정산은 동결된 스냅샷(settlement)을 그대로 넣고 다시 계산하지 않는다.
 * 책임·공제 여부나 법적 판단은 하지 않는다 — 판단은 조정기관·법원이 한다.
 */

export const EVIDENCE_NOTICE =
  '이 자료는 기록을 모은 참고 자료이며 법률 자문이 아닙니다. 책임과 금액에 대한 판단은 조정기관·법원이 합니다.';

const APPLY_MODE_LABELS = { auto: '자동 적용', manual: '수동 확인 필요', display: '표시만' };

const won = (n) => `${Number(n ?? 0).toLocaleString('ko-KR')}원`;

/** 'YYYY-MM-DD…' → 'YYYY-MM-DD'. 없으면 null. */
const day = (s) => (s ? String(s).slice(0, 10) : null);

/**
 * 항목의 적용 기준. 임차인 부담 항목만 금액 근거가 있다.
 * - 특약: { type: 'clause', clauseNo, title, text, formula } (조건부 특약을 임대인이 확인했으면 kind: 'standard', 창 25)
 * - 표준: { type: 'standard', formula: '견적 × 잔존 비율 (1 − 경과 ÷ (내구연수 × 12)) = 금액' }
 * - 임대인 부담·보류: { type: 'none', formula: 설명 }
 */
export function basisView(item, elapsedMonths) {
  const b = item.basis;
  const cost = item.estimateCost;
  if (item.payer === 'tenant' && b?.type === 'clause' && b.kind === 'standard') {
    // 임대인이 "특약 조건 해당"을 확인한 조건부 특약 (창 25) — 금액은 표준 기준 그대로
    const pct = Math.round((b.residual ?? 0) * 100);
    return {
      type: 'clause',
      kind: 'standard',
      clauseNo: b.clauseNo,
      title: b.clause?.title ?? null,
      text: b.clause?.text ?? null,
      formula:
        `계약 특약 제${b.clauseNo}항 적용(임대인 확인) · 표준 기준 금액: 견적 ${won(cost)} × 잔존 ${pct}% ` +
        `(1 − 경과 ${elapsedMonths}개월 ÷ (내구연수 ${item.lifespanYears}년 × 12)) = ${won(item.tenantAmount)}`,
    };
  }
  if (item.payer === 'tenant' && b?.type === 'clause') {
    return {
      type: 'clause',
      clauseNo: b.clauseNo,
      title: b.clause?.title ?? null,
      text: b.clause?.text ?? null,
      formula: `계약 특약 제${b.clauseNo}항 적용 · 견적 ${won(cost)} 전액 (참고: 표준 기준 ${won(b.stdAmount)})`,
    };
  }
  if (item.payer === 'tenant' && b) {
    const pct = Math.round((b.residual ?? 0) * 100);
    return {
      type: 'standard',
      clauseNo: null,
      title: null,
      text: null,
      formula:
        `표준 기준 · 견적 ${won(cost)} × 잔존 ${pct}% ` +
        `(1 − 경과 ${elapsedMonths}개월 ÷ (내구연수 ${item.lifespanYears}년 × 12)) = ${won(item.tenantAmount)}`,
    };
  }
  const formula = item.payer === 'landlord' ? '임대인 부담 · 임차인 청구 없음' : '보류 · 청구 금액에 넣지 않음';
  return { type: 'none', clauseNo: null, title: null, text: null, formula };
}

/** 항목의 청구 금액(부담자 기준). */
function amountOf(item) {
  if (item.payer === 'tenant') return item.tenantAmount ?? 0;
  if (item.payer === 'landlord') return item.landlordAmount ?? 0;
  return item.holdAmount ?? 0;
}

/**
 * 구역별 확인 표 (작성자·임차인). confirmations = 입주 스냅샷 구역 확인 + 발행 뒤 임차인 구역 확인.
 * @returns {Array<{ zone, author: boolean, tenant: boolean, tenantConfirmedAt: string|null }>}
 */
export function zoneConfirmationTable(zones, confirmations = []) {
  return zones.map((zone) => {
    const rows = confirmations.filter((c) => c.zone === zone);
    const tenantRow = rows.find((c) => c.role === 'tenant');
    return {
      zone,
      author: rows.some((c) => c.role === 'author'),
      tenant: !!tenantRow,
      tenantConfirmedAt: tenantRow?.confirmed_at ?? tenantRow?.confirmedAt ?? null,
    };
  });
}

function tenantReportView(r) {
  return {
    id: r.id,
    itemCode: r.itemCode,
    zone: r.zone,
    name: r.name,
    state: r.state,
    text: r.text,
    image: r.imageBase64 ?? null,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt ?? null,
  };
}

function leaseView(lease) {
  if (!lease) return null;
  return {
    id: lease.id,
    range: `${lease.startDate} ~ ${lease.endDate}`,
    startDate: lease.startDate,
    endDate: lease.endDate,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent ?? null,
    tenantName: lease.tenantName ?? null,
    tenantConfirmedAt: lease.tenantConfirmedAt ?? null,
    clauses: (lease.clauses ?? []).map((c) => ({
      clauseNo: c.clauseNo,
      title: c.templateTitle ?? null,
      text: c.text,
      applyMode: c.applyMode,
      applyLabel: APPLY_MODE_LABELS[c.applyMode] ?? c.applyMode,
      tenantConfirmedAt: c.tenantConfirmedAt ?? null,
    })),
  };
}

/**
 * @param {object} input
 * @param {object} input.settlement      정산 본문 (확정이면 동결 스냅샷, 아니면 computeSettlementBody 결과)
 * @param {boolean} input.frozen         settlement가 동결 스냅샷인가
 * @param {object|null} input.lease      정산이 쓰는 계약 (leaseRepo 모양)
 * @param {object} input.moveInSnapshot  입주 전 리포트 스냅샷
 * @param {object} input.moveOutSnapshot 퇴거 리포트 스냅샷
 * @param {Array}  input.tenantZoneConfirmations 발행 뒤 임차인 구역 확인 [{ zone, role, confirmed_at }]
 * @param {Array}  input.tenantReports   입주 리포트의 임차인 제보 (tenantReportRepo 모양)
 * @param {Array}  input.changes         diffBaseline().changes — 항목 사진(입주·퇴거) 출처
 * @param {string[]} input.zones         구역 순서 (ZONES)
 * @param {object|null} input.link       최근 정산 링크 { createdAt, firstViewedAt, expiresAt }
 * @param {{ moveIn, moveOut, settlement }} input.integrity 해시 검증 결과 (정산은 확정 전 null)
 * @param {Date} input.now
 */
export function buildEvidencePackage({
  settlement,
  frozen = false,
  lease = null,
  moveInSnapshot,
  moveOutSnapshot,
  tenantZoneConfirmations = [],
  tenantReports = [],
  changes = [],
  zones = [],
  link = null,
  integrity = {},
  now = new Date(),
}) {
  const changeByCode = new Map(changes.map((ch) => [ch.itemCode, ch]));
  const elapsedMonths = settlement.elapsedMonths ?? 0;

  // 입주 항목 사진이 없으면 그 구역 전경 사진(item_id 없음)을 보여 준다 — 비교 화면(diffView.moveInPhotoCell)과 같은 규칙
  const overviewOf = (zone) => (moveInSnapshot?.images ?? []).filter((img) => img.item_id == null && img.zone === zone);
  const items = (settlement.items ?? []).map((it) => {
    const ch = changeByCode.get(it.itemCode);
    const itemImages = ch?.moveInImages ?? [];
    const overview = itemImages.length ? [] : overviewOf(it.zone);
    return {
      itemCode: it.itemCode,
      zone: it.zone,
      name: it.name,
      tier: it.tier,
      from: it.from,
      to: it.to,
      evidence: it.evidence,
      payer: it.payer,
      estimateCost: it.estimateCost ?? null,
      amount: amountOf(it),
      basis: basisView(it, elapsedMonths),
      conditionClauseNo: it.conditionClauseNo ?? null,
      moveInImages: itemImages.length ? itemImages : overview,
      moveInOverview: !itemImages.length && overview.length > 0,
      moveOutImages: ch?.moveOutImages ?? [],
      tenantResponse: it.tenantResponse
        ? {
            response: it.tenantResponse,
            text: it.tenantResponseText ?? null,
            image: it.tenantResponseImage ?? null,
            respondedAt: it.tenantRespondedAt ?? null,
          }
        : null,
    };
  });

  const confirmations = [...(moveInSnapshot?.zoneConfirmations ?? []), ...tenantZoneConfirmations];
  const byStatus = (status) => tenantReports.filter((r) => r.status === status).map(tenantReportView);

  return {
    generatedAt: now.toISOString(),
    notice: EVIDENCE_NOTICE,
    settlement: {
      id: settlement.id,
      status: settlement.status,
      frozen,
      confirmedAt: settlement.confirmedAt ?? null,
      moveInDate: settlement.moveInDate,
      moveOutDate: settlement.moveOutDate,
      elapsedMonths,
    },
    unit: {
      id: settlement.unitId,
      name: settlement.unitName ?? moveInSnapshot?.unit?.name ?? null,
      building: moveInSnapshot?.unit?.building ?? null,
      address: moveInSnapshot?.unit?.address ?? null,
    },
    lease: leaseView(lease),
    baseline: {
      reportId: settlement.moveInReportId,
      date: day(moveInSnapshot?.generatedAt),
      grade: moveInSnapshot?.grade ?? null,
      contractor: moveInSnapshot?.parties?.contractor?.name ?? null,
      zoneConfirmations: zoneConfirmationTable(zones, confirmations),
      approvedTenantReports: byStatus('approved'),
      rejectedTenantReports: byStatus('rejected'),
      pendingTenantReportCount: tenantReports.filter((r) => r.status === 'pending').length,
    },
    moveOut: {
      reportId: settlement.moveOutReportId,
      date: day(moveOutSnapshot?.generatedAt),
      grade: moveOutSnapshot?.grade ?? null,
      typeLabel: moveOutSnapshot?.inspection?.typeLabel ?? null,
    },
    items,
    fees: settlement.fees ?? [],
    manualClauses: settlement.manualClauses ?? [],
    totals: settlement.totals,
    link: link ? { createdAt: link.createdAt, firstViewedAt: link.firstViewedAt ?? null, expiresAt: link.expiresAt } : null,
    integrity: {
      moveIn: integrity.moveIn ?? null,
      moveOut: integrity.moveOut ?? null,
      settlement: integrity.settlement ?? null,
      verifiedAt: now.toISOString(),
    },
  };
}
