/**
 * 수선비 장부 (창 16, 순수 함수, AI 사용 안 함).
 *
 * 원천은 **합의 확정된 정산의 스냅샷**(창 15)에서 payer === 'landlord'인 항목이다.
 * 확정 전 정산의 임대인 부담 항목은 "예정"(pending)으로 따로 두고 합계에 넣지 않는다.
 * 세금 계산·필요경비 판단은 하지 않는다 — 금액을 모아 보여 주고 CSV로 내보낼 뿐이다.
 */
import { toDateString } from './tenantReport.js';

export const REASONS = {
  objection: '이의 후 임대인 부담',
  smallBulk: '소액 일괄',
  naturalWear: '자연 마모 후보',
  manual: '임대인 선택',
};

export const CSV_HEADER = ['확정일', '호실', '구역', '항목', '금액', '사유', '정산번호'];
export const TAX_NOTICE = '필요경비 인정 여부는 세무사 확인이 필요합니다';

/**
 * 스냅샷 항목 → 사유. 순서: 이의 → 소액 일괄 → 기본 부담자(자연 마모 후보) → 임대인 선택.
 * payerSource가 없는 옛 스냅샷은 기본 부담자만 보고 나머지는 "임대인 선택".
 */
export function ledgerReason(item) {
  if (item.tenantResponse === 'object') return REASONS.objection;
  if (item.payerSource === 'bulk_small') return REASONS.smallBulk;
  if (!item.payerSource && item.defaultPayer === 'landlord') return REASONS.naturalWear;
  return REASONS.manual;
}

/** ISO 시각 → 서버 현지 날짜 'YYYY-MM-DD' (할 일 계산과 같은 기준). */
export function ledgerDate(iso) {
  return iso ? toDateString(new Date(iso)) : null;
}

/** 정산 본문(스냅샷 또는 계산 결과) → 임대인 부담 행. */
function landlordRows(body, { date, hashOk }) {
  return (body.items ?? [])
    .filter((it) => it.payer === 'landlord')
    .map((it) => ({
      date,
      unitId: body.unitId,
      unitName: body.unitName,
      zone: it.zone,
      itemCode: it.itemCode,
      itemName: it.name,
      amount: it.landlordAmount ?? 0,
      source: 'settlement',
      settlementId: body.id,
      reason: ledgerReason(it),
      ...(hashOk === undefined ? {} : { hashOk }),
    }));
}

const byDateThenId = (a, b) =>
  String(a.date ?? '').localeCompare(String(b.date ?? '')) ||
  a.settlementId - b.settlementId ||
  String(a.itemCode).localeCompare(String(b.itemCode));

/**
 * @param {object} input
 * @param {Array<{snapshot:object, hashOk:boolean}>} input.confirmed  확정 정산 스냅샷(+ 해시 검증 결과)
 * @param {Array<object>} input.drafts  확정 전 정산 계산 결과 (예정)
 * @param {{year?:number|null, unitId?:number|null}} [input.filter]
 * @returns {{ rows, pending, totals: { byUnit, byYear, total }, years }}
 */
export function buildRepairLedger({ confirmed = [], drafts = [], filter = {} }) {
  const year = filter.year ?? null;
  const unitId = filter.unitId ?? null;
  const unitOk = (r) => unitId == null || r.unitId === unitId;

  const all = confirmed
    .flatMap(({ snapshot, hashOk }) => landlordRows(snapshot, { date: ledgerDate(snapshot.confirmedAt), hashOk }))
    .sort(byDateThenId);
  const years = [...new Set(all.map((r) => Number(r.date?.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);

  const rows = all.filter((r) => unitOk(r) && (year == null || Number(r.date?.slice(0, 4)) === year));
  const pending = drafts
    .flatMap((body) => landlordRows(body, { date: null }).map((r) => ({ ...r, status: body.status })))
    .filter(unitOk)
    .sort(byDateThenId);

  return { rows, pending, totals: ledgerTotals(rows), years };
}

/** 확정 행 → 호실별·연도별·전체 합계. */
export function ledgerTotals(rows) {
  const units = new Map();
  const years = new Map();
  let total = 0;
  for (const r of rows) {
    total += r.amount;
    const u = units.get(r.unitId) ?? { unitId: r.unitId, unitName: r.unitName, total: 0, count: 0 };
    u.total += r.amount;
    u.count += 1;
    units.set(r.unitId, u);
    const y = Number(r.date.slice(0, 4));
    const yr = years.get(y) ?? { year: y, total: 0, count: 0 };
    yr.total += r.amount;
    yr.count += 1;
    years.set(y, yr);
  }
  return {
    byUnit: [...units.values()].sort((a, b) => String(a.unitName).localeCompare(String(b.unitName))),
    byYear: [...years.values()].sort((a, b) => a.year - b.year),
    total,
  };
}

/** CSV 칸: 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다. */
export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 장부 → CSV 문자열. UTF-8 BOM(엑셀 한글 깨짐 방지) + 헤더 + 행 + 마지막 줄 합계. 줄바꿈 CRLF.
 * 금액은 쉼표 없는 정수(엑셀에서 숫자로 읽히게).
 */
export function toCsv({ rows, totals }) {
  const lines = [
    CSV_HEADER,
    ...rows.map((r) => [r.date, r.unitName, r.zone, r.itemName, r.amount, r.reason, r.settlementId]),
    ['합계', '', '', '', totals.total, '', ''],
  ];
  return '﻿' + lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** 쿼리 year/unitId → 숫자 또는 null. 잘못된 값이면 { error }. */
export function parseLedgerFilter(query = {}) {
  const out = { year: null, unitId: null };
  for (const key of ['year', 'unitId']) {
    const raw = query[key];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return { error: key };
    out[key] = n;
  }
  return out;
}
