// House Log (창 18) 표시용 순수 헬퍼.
// 백엔드 GET /api/units/:id/house-log 응답 { unit, leases: [{ id, range, tenantName }], events } 을 그대로 쓴다
// (이벤트 생성·정렬·계약 묶음은 백엔드 lib/houseLog.js). 여기서는 필터·구획·아이콘·뱃지 문구만 만든다.
import { formatDateTime } from './settlementShareView.js';

/** 종류별 아이콘·점 색·필터 그룹 (창 24 점 색 = 토큰: 계약 seal · 점검 accent · 정산 warn · 확정/장부 ok · 종료 ink-3) */
export const KIND_META = {
  lease_start: { icon: '📝', label: '계약', group: 'lease', dot: 'bg-seal' },
  clauses_confirmed: { icon: '✅', label: '특약 확인', group: 'lease', dot: 'bg-seal' },
  lease_end: { icon: '🏁', label: '계약 종료', group: 'lease', dot: 'bg-ink-3' },
  report: { icon: '📋', label: '점검', group: 'inspection', dot: 'bg-accent' },
  carryover: { icon: '↪️', label: '이전 기록 이어받음', group: 'inspection', dot: 'bg-accent' }, // 창 20
  tenant_report: { icon: '🙋', label: '입주 제보', group: 'inspection', dot: 'bg-accent' },
  settlement_link: { icon: '🔗', label: '정산 링크', group: 'settlement', dot: 'bg-warn' },
  tenant_response: { icon: '💬', label: '임차인 응답', group: 'settlement', dot: 'bg-warn' },
  settlement_confirmed: { icon: '🤝', label: '합의 확정', group: 'settlement', dot: 'bg-ok' },
  ledger: { icon: '📒', label: '수선비 장부', group: 'settlement', dot: 'bg-ok' },
};
const FALLBACK_META = { icon: '•', label: '기록', group: 'other', dot: 'bg-ink-3' };

export function kindMeta(kind) {
  return KIND_META[kind] ?? FALLBACK_META;
}

/** 필터 칩: 전체 / 점검 / 정산 / 계약 */
export const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'inspection', label: '점검' },
  { key: 'settlement', label: '정산' },
  { key: 'lease', label: '계약' },
];

export function filterEvents(events = [], filter = 'all') {
  return filter === 'all' ? events : events.filter((e) => kindMeta(e.kind).group === filter);
}

/**
 * 계약별 구획. 계약 시작일 순(백엔드 leases 순서), 그 안은 이벤트 순서 그대로(시간순).
 * 계약에 묶이지 않은 이벤트(leaseId null)는 맨 뒤 "계약 없음". 이벤트가 없는 구획은 필터 중에만 숨긴다.
 */
export function leaseSections(log, filter = 'all') {
  const events = filterEvents(log?.events ?? [], filter);
  const sections = (log?.leases ?? []).map((l) => ({
    key: `lease-${l.id}`,
    title: `${l.range} · 임차인 ${l.tenantName ?? '-'}`,
    events: events.filter((e) => e.leaseId === l.id),
  }));
  const orphans = events.filter((e) => !log?.leases?.some((l) => l.id === e.leaseId));
  if (orphans.length) sections.push({ key: 'no-lease', title: '계약 없음', events: orphans });
  return filter === 'all' ? sections : sections.filter((s) => s.events.length);
}

/**
 * 위 요약: 리포트·정산서 해시 검증 결과(integrity가 있는 이벤트)만 센다.
 * 하나라도 실패면 빨간 요약. 색은 목업 sealbox 축소판(정상 seal · 변경 crit).
 */
export function integritySummary(events = []) {
  const checked = events.filter((e) => e.integrity);
  const ok = checked.filter((e) => e.integrity.ok).length;
  const total = checked.length;
  if (!total) return { total, ok, allOk: true, text: '해시 검증 대상 없음', class: 'border-line bg-surface text-ink-2' };
  if (ok === total) {
    return {
      total,
      ok,
      allOk: true,
      text: `🔒 모든 리포트·정산서 해시 검증 ${ok}/${total} 정상`,
      class: 'border-seal bg-seal-soft text-seal',
    };
  }
  return {
    total,
    ok,
    allOk: false,
    text: `⚠ 해시 검증 ${ok}/${total} 정상 · ${total - ok}건 변경 감지`,
    class: 'border-crit bg-crit-soft text-crit',
  };
}

/** 이벤트의 작은 무결성 뱃지. integrity가 없으면 null. */
export function integrityChip(integrity) {
  if (!integrity) return null;
  return integrity.ok
    ? { text: `🔒 ${integrity.shortHash ?? ''}`.trim(), class: 'bg-seal-soft text-seal' }
    : { text: '⚠ 변경 감지', class: 'bg-crit-soft text-crit' };
}

/** 이벤트 시각 → 'YYYY-MM-DD' / 'HH:MM' (브라우저 현지) */
export function eventDate(at) {
  const s = formatDateTime(at);
  return { date: s.slice(0, 10), time: s.slice(11) };
}

export function countText(events = []) {
  return `기록 ${events.length}건`;
}

/** 역할별 House Log 경로 */
export function houseLogPath(role, unitId) {
  return `/${role === 'tenant' ? 'tenant' : 'owner'}/units/${unitId}/house-log`;
}
