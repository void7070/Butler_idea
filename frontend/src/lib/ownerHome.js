// 임대인 홈 "오늘 할 일" (창 14) 표시용 순수 헬퍼.
// 백엔드 GET /api/owner/todos 응답 { todos: [카드], units: [호실 요약] } 을 그대로 쓴다(계산은 백엔드 lib/todos.js).
// 카드: { kind, unitId, unitName, title, detail, dueDate, dday, severity, link }
// 여기서는 칩 색·문구·링크만 만든다. 알림 발송 없음.

import { DDAY_TONE, EDGE_TONE, PILL_TONE } from './uiTones.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 상단 날짜: "2026년 9월 26일 (토)".
 * serverToday = GET /api/health 의 today('YYYY-MM-DD', 시연 기준일 DEMO_TODAY 반영, 창 17).
 * 없거나 형식이 틀리면 브라우저 현지 날짜(now).
 */
export function formatToday(serverToday = null, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serverToday ?? '');
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : now;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 상단 건수 문구 */
export function todoCountText(todos = []) {
  return todos.length ? `오늘 확인할 일 ${todos.length}건` : '오늘 확인할 일이 없습니다';
}

const SEVERITY_CLASS = DDAY_TONE;

/** 기한 없는 카드의 칩 문구 */
const NO_DUE_LABEL = { crit: '바로 확인', warn: '확인 필요', calm: '참고' };

/** D-day 칩: crit 빨강 / warn 주황 / calm 회색 (디자인 토큰, 창 21). dday 음수 = 지남(D+n), null = 기한 없음 */
export function ddayChip(todo) {
  const severity = SEVERITY_CLASS[todo?.severity] ? todo.severity : 'calm';
  const dday = todo?.dday;
  let label;
  if (dday == null) label = NO_DUE_LABEL[severity];
  else if (dday === 0) label = 'D-DAY';
  else if (dday > 0) label = `D-${dday}`;
  else label = `D+${-dday} 지남`;
  return { label, class: SEVERITY_CLASS[severity], severity };
}

/** 카드 왼쪽 테두리 색 */
export function cardBorderClass(severity) {
  return EDGE_TONE[severity] ?? EDGE_TONE.calm;
}

const MOVE_OUT_TYPES = ['move_out_pre', 'move_out_post'];

const byDateThenId = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id;

/**
 * 호실의 비교할 입주·퇴거 리포트 쌍.
 * 퇴거 = 가장 최근 퇴거 전/후 리포트, 입주 = 그 퇴거 날짜 이전(같은 날 포함)의 가장 최근 입주 전 리포트.
 * 퇴거가 없으면 가장 최근 입주 전 리포트만. reports = GET /api/reports 목록(unitName으로 호실 구분).
 */
export function moveReportPair(reports = [], unitName) {
  const mine = reports.filter((r) => r.unitName === unitName);
  const moveOut = mine.filter((r) => MOVE_OUT_TYPES.includes(r.type)).sort(byDateThenId).at(-1) ?? null;
  const moveIns = mine.filter((r) => r.type === 'move_in').sort(byDateThenId);
  const moveIn = moveOut
    ? (moveIns.filter((r) => byDateThenId(r, moveOut) <= 0).at(-1) ?? null)
    : (moveIns.at(-1) ?? null);
  return { moveIn, moveOut };
}

/** 비교 화면 경로 — 입주(왼쪽)·퇴거(오른쪽)가 미리 선택되게 query를 붙인다 */
export function compareLink({ moveIn, moveOut } = {}) {
  const params = new URLSearchParams();
  if (moveIn) params.set('leftId', String(moveIn.id));
  if (moveOut) params.set('rightId', String(moveOut.id));
  const qs = params.toString();
  return qs ? `/owner/compare?${qs}` : '/owner/compare';
}

/**
 * 카드를 누르면 갈 경로. 퇴거 카드는 그 호실의 입주·퇴거 리포트를 골라 비교 화면으로,
 * 나머지(제보 승인 / 정산 / 계약 이력)는 백엔드가 준 link 그대로.
 */
export function todoLink(todo, reports = []) {
  if (todo.kind === 'move_out') return compareLink(moveReportPair(reports, todo.unitName));
  return todo.link || '/owner/reports';
}

/** 비교 화면 query → 미리 선택할 리포트 id (없거나 목록에 없으면 '') */
export function comparePreselect(query = {}, reports = []) {
  const pick = (v) => {
    const id = Number(Array.isArray(v) ? v[0] : v);
    return Number.isInteger(id) && reports.some((r) => r.id === id) ? id : '';
  };
  const leftId = pick(query.leftId);
  const rightId = pick(query.rightId);
  return { leftId, rightId, ready: leftId !== '' && rightId !== '' };
}

const leaseBadge = (label, tone) => ({ label, tone, class: PILL_TONE[tone] });

const LEASE_STATUS = {
  none: leaseBadge('계약 없음', 'plain'),
  upcoming: leaseBadge('입주 예정', 'seal'),
  active: leaseBadge('계약 중', 'ok'),
  ending: leaseBadge('종료 임박', 'warn'),
  ended: leaseBadge('계약 종료', 'plain'),
};

/** 호실 계약 상태 뱃지 (tone = Pill 색) */
export function leaseStatusBadge(status) {
  return LEASE_STATUS[status] ?? LEASE_STATUS.none;
}

/** 호실 카드의 다음 기한 문구 */
export function nextDueText(nextDue) {
  if (!nextDue) return '다가오는 기한 없음';
  const d = nextDue.dday === 0 ? 'D-DAY' : `D-${nextDue.dday}`;
  return `${nextDue.title} · ${nextDue.dueDate} (${d})`;
}

/** 호실 카드 링크: 계약 이력, 그 호실만 거른 리포트 목록 */
export function unitLinks(unit) {
  return {
    leases: `/owner/units/${unit.unitId}/leases`,
    houseLog: `/owner/units/${unit.unitId}/house-log`,
    reports: `/owner/reports?unit=${encodeURIComponent(unit.unitName)}`,
  };
}

/** 임대인 내비 (창 21부터 하단 탭바) */
export const OWNER_NAV = [
  { label: '홈', to: '/owner' },
  { label: '리포트', to: '/owner/reports' },
  { label: '수선비 장부', to: '/owner/repair-ledger' },
];

/**
 * 내비 항목 활성 여부: 홈은 /owner 정확히, 수선비 장부는 그 경로, 리포트는 그 밖의 /owner/...
 * (비교·정산·계약 화면은 리포트에서 들어가므로 리포트로 본다)
 */
export function isNavActive(item, path) {
  if (item.to === '/owner') return path === '/owner' || path === '/owner/';
  const own = OWNER_NAV.find((n) => n.to !== '/owner' && n.to !== '/owner/reports' && path.startsWith(n.to));
  if (item.to === '/owner/reports') return path.startsWith('/owner/') && !own;
  return path.startsWith(item.to);
}
