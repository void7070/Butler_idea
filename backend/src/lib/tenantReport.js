import { errors } from './errors.js';
import { validateImageSize } from './validation.js';
import { getItem } from '../domain/itemCatalog.js';

/**
 * 임차인 입주 제보 (창 10, 순수 로직). AI 사용 안 함.
 * 임차인은 계약 시작일부터 7일 안에 입주 리포트에 없는 이상 항목을 제보하고 구역을 확인한다.
 * 임대인이 승인한 제보만 diff에서 입주 상태로 반영된다(lib/diff.js).
 */

export const REPORT_WINDOW_DAYS = 7;
export const TENANT_REPORT_STATES = ['minor', 'damaged', 'broken'];
export const TENANT_REPORT_STATUSES = ['pending', 'approved', 'rejected'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date → 'YYYY-MM-DD' (서버 현지 날짜). */
export function toDateString(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** 'YYYY-MM-DD' 두 개 사이 일수 (b − a). */
function daysBetween(a, b) {
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY_MS);
}

function ymd(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return [y, m - 1, d];
}

/**
 * 제보 가능 기간. 시작일부터 7일째 날(deadline)까지 포함해서 열려 있다.
 * @param {string} startDate 'YYYY-MM-DD' (계약 시작일, 없으면 입주 리포트 날짜)
 * @param {Date} now
 * @returns {{ startDate, deadline, open, daysLeft }} daysLeft: 마감일까지 남은 일수(0 = 오늘 마감, 음수 = 지남)
 */
export function reportWindow(startDate, now) {
  const start = startDate.slice(0, 10);
  const [y, m, d] = ymd(start);
  const deadline = toDateString(new Date(y, m, d + REPORT_WINDOW_DAYS));
  const daysLeft = daysBetween(toDateString(now), deadline);
  return { startDate: start, deadline, open: daysLeft >= 0, daysLeft };
}

/** 기간이 지났으면 400. */
export function assertWindowOpen(period) {
  if (!period.open) throw errors.badRequest('제보 기간이 끝났습니다.', 'REPORT_WINDOW_CLOSED');
}

/**
 * 제보 입력 검증·정리. 잘못되면 AppError(400).
 * @returns {{ itemCode, state, text, imageBase64 }}
 */
export function normalizeTenantReport(body) {
  const itemCode = body?.itemCode;
  if (!getItem(itemCode)) throw errors.badRequest('알 수 없는 항목 코드입니다.', 'INVALID_ITEM_CODE');
  const state = body?.state;
  if (!TENANT_REPORT_STATES.includes(state)) {
    throw errors.badRequest('제보 상태는 경미·손상·파손 중 하나입니다.', 'INVALID_STATE');
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) throw errors.badRequest('제보 내용을 입력하세요.', 'VALIDATION');
  const imageBase64 = body?.imageBase64 || null;
  if (imageBase64) validateImageSize(imageBase64);
  return { itemCode, state, text, imageBase64 };
}

/**
 * 구역 확인 현황.
 * @param {string[]} zones ZONES
 * @param {Array<{zone, role}>} confirmations zone_confirmations
 * @returns {{ zones: Array<{zone, authorConfirmed, tenantConfirmed}>, unconfirmedZones: string[] }} unconfirmedZones = 임차인 미확인
 */
export function zoneStatus(zones, confirmations) {
  const has = (zone, role) => confirmations.some((c) => c.zone === zone && c.role === role);
  const rows = zones.map((zone) => ({
    zone,
    authorConfirmed: has(zone, 'author'),
    tenantConfirmed: has(zone, 'tenant'),
  }));
  return { zones: rows, unconfirmedZones: rows.filter((r) => !r.tenantConfirmed).map((r) => r.zone) };
}
