// 임차인 입주 제보 (창 10) 표시용 순수 헬퍼.
// 백엔드 GET /api/reports/:id/tenant-reports 응답
// { reportId, window: { startDate, deadline, open, daysLeft }, zones, unconfirmedZones, tenantReports } 를 그대로 쓴다.
// 승인·거절 판단은 사람이 한다(임대인). 여기서는 문구·색·입력 검증만.
// 색은 창 24에서 디자인 토큰으로(uiTones.js — 목업 t-movein·movein-review). tone = <Pill>/<DdayChip> 키.
import { DDAY_TONE, PILL_TONE } from './uiTones.js';

export const REPORT_STATE_OPTIONS = [
  { value: 'minor', label: '경미' },
  { value: 'damaged', label: '손상' },
  { value: 'broken', label: '파손' },
];

const STATUS_BADGES = {
  pending: { label: '승인 대기', tone: 'warn' },
  approved: { label: '승인 · 입주 기준선 반영', tone: 'ok' },
  rejected: { label: '거절', tone: 'crit' },
};

export function statusBadge(status) {
  const b = STATUS_BADGES[status] ?? { label: status ?? '', tone: 'plain' };
  return { ...b, class: PILL_TONE[b.tone] };
}

/** 마감 표시: D-n / D-DAY / 마감 */
export function deadlineBadge(window) {
  if (!window) return { label: '', class: '', severity: 'calm', open: false };
  if (!window.open) return { label: '제보 마감', class: DDAY_TONE.calm, severity: 'calm', open: false };
  // 목업 .dday: 제보 기간 중 warn(목업 D-5), 마감일·2일 이하 crit
  const severity = window.daysLeft <= 2 ? 'crit' : 'warn';
  return { label: window.daysLeft === 0 ? 'D-DAY' : `D-${window.daysLeft}`, class: DDAY_TONE[severity], severity, open: true };
}

/** 기간 안내 문구 */
export function windowText(window) {
  if (!window) return '';
  const range = `${window.startDate} ~ ${window.deadline}`;
  return window.open ? `제보 기간 ${range}` : `제보 기간이 끝났습니다 (${range})`;
}

export function countByStatus(tenantReports = []) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const r of tenantReports) if (r.status in counts) counts[r.status] += 1;
  return counts;
}

/** 대기 → 먼저, 그다음 id 순 */
export function sortReports(tenantReports = []) {
  const order = { pending: 0, approved: 1, rejected: 2 };
  return [...tenantReports].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id - b.id);
}

/** 구역 확인 현황 → 칸 표시 */
export function zoneCells(zones = []) {
  return zones.map((z) => ({
    zone: z.zone,
    tenantConfirmed: z.tenantConfirmed,
    label: z.tenantConfirmed ? '임차인 확인' : '미확인',
    // 목업 .zcell / .zcell.on
    class: z.tenantConfirmed ? 'bg-ok-soft font-semibold text-ok' : 'bg-surface-2 text-ink-3',
  }));
}

/** 카탈로그에서 구역의 항목 목록 */
export function itemsOfZone(catalog, zone) {
  return (catalog?.items ?? []).filter((it) => it.zone === zone);
}

/** 제보 폼 검증. 문제 없으면 '' */
export function reportFormError(form) {
  if (!form.itemCode) return '항목을 고르세요.';
  if (!REPORT_STATE_OPTIONS.some((o) => o.value === form.state)) return '상태를 고르세요.';
  if (!form.text?.trim()) return '내용을 입력하세요.';
  return '';
}

/** 제보 폼 → POST 본문 */
export function reportPayload(form) {
  return {
    itemCode: form.itemCode,
    state: form.state,
    text: form.text.trim(),
    ...(form.imageBase64 ? { imageBase64: form.imageBase64 } : {}),
  };
}
