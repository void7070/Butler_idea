// 분쟁 대비 증빙 패키지 표시용 순수 헬퍼 (창 19).
// GET /api/settlements/:id/evidence 의 evidence를 그대로 쓴다. 조립·계산은 백엔드(lib/evidencePackage.js)가 한다.
// 여기서는 문구·날짜 형식·표 모양만 정한다. 책임·공제·법적 판단 문구는 쓰지 않는다.
import { formatWon } from './settlementView.js';
import { stateLabel, shortHash } from './reportView.js';
import { evidenceBadge } from './diffView.js';

export const EVIDENCE_TITLE = '분쟁 대비 증빙 자료';

export const EVIDENCE_NOTICES = [
  '이 자료는 버틀러에 저장된 기록을 모은 참고 자료이며 법률 자문이 아닙니다.',
  '책임과 금액에 대한 판단은 조정기관·법원이 합니다.',
  '해시 검증은 기록이 발행·확정 이후 바뀌지 않았는지를 보여 줄 뿐, 기록 내용의 사실 여부를 보증하지 않습니다.',
];

const PAYER_LABELS = { tenant: '임차인 부담', landlord: '임대인 부담', hold: '보류' };
const STATUS_LABELS = { draft: '합의 전', hold: '보류 · 임차인 이의', confirmed: '합의 확정' };

export function payerLabel(payer) {
  return PAYER_LABELS[payer] ?? payer ?? '';
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status ?? '';
}

/** 정산 id → 증빙 화면 경로. */
export function evidencePath(settlementId) {
  return `/owner/settlements/${settlementId}/evidence`;
}

/** 정산 화면 버튼. 보류면 강조 + 안내 문구. */
export function evidenceButton(settlement) {
  if (!settlement?.id) return null;
  const hold = settlement.status === 'hold';
  return {
    to: evidencePath(settlement.id),
    label: EVIDENCE_TITLE,
    emphasized: hold,
    hint: hold
      ? '합의가 되지 않으면 분쟁조정위원회 등에 낼 수 있게 계약·기준선·비교·응답·해시 검증을 한 묶음으로 모았습니다.'
      : '계약·기준선·비교·응답·해시 검증을 한 묶음으로 인쇄하거나 PDF로 저장합니다.',
  };
}

/**
 * 시각 → 'YYYY-MM-DD HH:MM' (브라우저 현지). 시간대 없는 'YYYY-MM-DD HH:MM:SS'는 현지 시각 그대로 쓰고,
 * 날짜만('YYYY-MM-DD') 있으면 그대로. 없으면 ''.
 */
export function formatStamp(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 16);
  const iso = s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 무결성 검증 표 (리포트 2개 + 정산서).
 * status: 'ok' 일치 / 'fail' 변경 감지 / 'none' 검증 대상 없음(확정 전 정산서)
 */
export function integrityRows(pkg) {
  const it = pkg?.integrity ?? {};
  const row = (key, label, verify, noneText) => {
    if (!verify) return { key, label, status: 'none', text: noneText, storedHash: '', currentHash: '' };
    return {
      key,
      label,
      status: verify.ok ? 'ok' : 'fail',
      text: verify.ok ? '일치 · 기록 이후 변경 없음' : '불일치 · 기록된 해시와 다름 (변경 감지)',
      storedHash: verify.storedHash ?? '',
      currentHash: verify.currentHash ?? '',
    };
  };
  return [
    row('moveIn', `입주 기준선 리포트 #${pkg?.baseline?.reportId ?? '-'}`, it.moveIn, '스냅샷 없음'),
    row('moveOut', `퇴거 리포트 #${pkg?.moveOut?.reportId ?? '-'}`, it.moveOut, '스냅샷 없음'),
    row('settlement', `정산서 #${pkg?.settlement?.id ?? '-'}`, it.settlement, '합의 확정 전이라 동결된 정산서가 없습니다'),
  ];
}

/** 표지 해시 요약 한 줄. */
export function integritySummary(pkg) {
  const rows = integrityRows(pkg).filter((r) => r.status !== 'none');
  const fails = rows.filter((r) => r.status === 'fail').length;
  if (rows.length === 0) return { ok: true, text: '검증할 기록이 없습니다' };
  if (fails > 0) return { ok: false, text: `해시 검증 ${rows.length - fails}/${rows.length} 일치 · ${fails}건 변경 감지` };
  return { ok: true, text: `해시 검증 ${rows.length}/${rows.length} 일치` };
}

/** 표지. */
export function coverView(pkg) {
  const s = pkg?.settlement ?? {};
  const hashParts = integrityRows(pkg)
    .filter((r) => r.status !== 'none')
    .map((r) => ({ key: r.key, label: r.label, hash: shortHash(r.storedHash) }));
  const hashes = hashParts.map((h) => `${h.label} ${h.hash}`);
  return {
    unitName: [pkg?.unit?.building, pkg?.unit?.name].filter(Boolean).join(' '),
    address: pkg?.unit?.address ?? '',
    period: `입주 ${s.moveInDate ?? '-'} → 퇴거 ${s.moveOutDate ?? '-'} (경과 ${s.elapsedMonths ?? 0}개월)`,
    leaseRange: pkg?.lease?.range ?? '계약 정보 없음',
    statusText: `정산 #${s.id ?? '-'} · ${statusLabel(s.status)}${s.confirmedAt ? ` (${formatStamp(s.confirmedAt)})` : ''}`,
    basisText: s.frozen ? '확정 정산서 스냅샷 기준' : '생성 시각의 계산 기준 (확정 전)',
    generatedText: formatStamp(pkg?.generatedAt),
    summary: integritySummary(pkg),
    hashes,
    hashParts, // 창 28: 화면에서 해시만 숫자 글꼴로
  };
}

/** 구역 확인 표 한 줄. */
export function zoneRow(z) {
  return {
    zone: z.zone,
    author: z.author ? '확인' : '—',
    tenant: z.tenant ? '확인' : '미확인',
    tenantAt: z.tenant ? formatStamp(z.tenantConfirmedAt) : '',
  };
}

/** 입주 제보 한 줄. */
export function tenantReportRow(r) {
  return {
    key: r.id,
    title: `${r.zone ?? ''} ${r.name ?? r.itemCode} · ${stateLabel(r.state)}`.trim(),
    text: r.text ?? '',
    image: r.image ?? null,
    createdAt: formatStamp(r.createdAt),
    decidedAt: formatStamp(r.decidedAt),
  };
}

/** 항목 카드 (3장). */
export function itemCardView(item) {
  const basis = item.basis ?? {};
  let basisTitle = '적용 기준 없음';
  if (basis.type === 'clause') {
    basisTitle = `계약 특약 제${basis.clauseNo}항${basis.title ? ` (${basis.title})` : ''}`;
    if (basis.kind === 'standard') basisTitle += ' · 표준 기준 금액'; // 조건부 특약 (창 25)
  }
  else if (basis.type === 'standard') basisTitle = '표준 기준 (잔존가치 계산)';
  return {
    key: item.itemCode,
    title: `${item.zone} · ${item.name}`,
    stateText: `입주 ${stateLabel(item.from === 'unknown' ? '기록 없음' : item.from)} → 퇴거 ${stateLabel(item.to)}`,
    evidence: item.evidence,
    evidenceLabel: evidenceBadge(item.evidence).label,
    payerLabel: payerLabel(item.payer),
    amountText: formatWon(item.amount),
    basisTitle,
    clauseText: basis.type === 'clause' ? basis.text ?? '' : '',
    formula: basis.formula ?? '',
    moveInImages: item.moveInImages ?? [],
    moveInOverview: !!item.moveInOverview,
    moveOutImages: item.moveOutImages ?? [],
  };
}

/** 임차인 응답 이력 (4장). 응답 시각 순. */
export function responseRows(items = []) {
  return items
    .filter((it) => it.tenantResponse)
    .map((it) => ({
      key: it.itemCode,
      title: `${it.zone} · ${it.name}`,
      response: it.tenantResponse.response,
      label: it.tenantResponse.response === 'object' ? '이의' : '동의',
      text: it.tenantResponse.text ?? '',
      image: it.tenantResponse.image ?? null,
      at: formatStamp(it.tenantResponse.respondedAt),
      sortAt: it.tenantResponse.respondedAt ?? '',
    }))
    .sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)));
}

/** 링크 기록 문구. */
export function linkLines(link) {
  if (!link) return ['임차인 확인 링크를 만들지 않았습니다.'];
  return [
    `링크 생성 ${formatStamp(link.createdAt)}`,
    link.firstViewedAt ? `임차인 최초 열람 ${formatStamp(link.firstViewedAt)}` : '임차인 열람 기록 없음',
    `링크 만료 ${formatStamp(link.expiresAt)}`,
  ];
}

/** 합계 줄. */
export function totalsRows(totals) {
  const t = totals ?? {};
  return [
    { key: 'tenant', label: '임차인 청구 합계', value: formatWon(t.tenantTotal ?? 0) },
    { key: 'deposit', label: '보증금', value: t.deposit == null ? '계약 정보 없음' : formatWon(t.deposit) },
    { key: 'return', label: '보증금 반환 예정', value: t.depositReturn == null ? '-' : formatWon(t.depositReturn) },
    { key: 'landlord', label: '임대인 부담', value: formatWon(t.landlordTotal ?? 0) },
    { key: 'hold', label: '보류 (합계 제외)', value: formatWon(t.holdTotal ?? 0) },
  ];
}
