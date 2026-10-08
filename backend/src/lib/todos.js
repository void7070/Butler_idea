import { reportWindow, toDateString } from './tenantReport.js';

/**
 * 임대인 홈 "오늘 할 일" 카드 계산 (창 13, 순수 로직). AI 사용 안 함, 알림 발송 없음.
 * 날짜는 서버 현지 날짜(YYYY-MM-DD) 기준이고 now를 주입할 수 있다.
 * 법정 기한(전월세 신고·갱신 거절 통지)은 안내용 계산이며 법률 자문이 아니다.
 *
 * 카드: { kind, unitId, unitName, title, detail, dueDate, dday, severity, link }
 *   severity 'crit' | 'warn' | 'calm', dday = dueDate − 오늘(음수 = 지남, 기한 없으면 null)
 */

export const MOVE_OUT_NOTICE_DAYS = 60; // 계약 종료 60일 전부터 퇴거 준비
export const RENT_REPORT_DAYS = 30; // 전월세 신고: 계약일 + 30일 (시작일을 계약일로 간주)
export const RENEWAL_NOTICE_FROM_MONTHS = 6; // 갱신 거절 통지: 만료 6개월 전 ~
export const RENEWAL_NOTICE_TO_MONTHS = 2; // ~ 2개월 전
export const LEGAL_NOTICE = '안내용 계산이며 법률 자문이 아닙니다';

const SEVERITY_ORDER = { crit: 0, warn: 1, calm: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return [y, m - 1, d];
}

/** 'YYYY-MM-DD' 두 개 사이 일수 (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY_MS);
}

export function addDays(date, days) {
  const [y, m, d] = ymd(date);
  return toDateString(new Date(y, m, d + days));
}

/** 달 더하기. 없는 날은 그 달 말일로 (08-31 − 6개월 → 02-28). */
export function addMonths(date, months) {
  const [y, m, d] = ymd(date);
  const lastDay = new Date(y, m + months + 1, 0).getDate();
  return toDateString(new Date(y, m + months, Math.min(d, lastDay)));
}

/** D-n / D-DAY / D+n */
export function ddayLabel(dday) {
  if (dday === 0) return 'D-DAY';
  return dday > 0 ? `D-${dday}` : `D+${-dday}`;
}

/** 호실별 최근 계약 (시작일 늦은 것, 같으면 id 큰 것). */
function latestByUnit(leases) {
  const map = new Map();
  for (const l of leases) {
    const cur = map.get(l.unitId);
    if (!cur || l.startDate > cur.startDate || (l.startDate === cur.startDate && l.id > cur.id)) map.set(l.unitId, l);
  }
  return map;
}

function card(kind, lease, fields) {
  return { kind, unitId: lease.unitId, unitName: lease.unitName, ...fields };
}

/**
 * @param {object} input
 * @param {Array} input.leases [{ id, unitId, unitName, tenantName, startDate, endDate, tenantConfirmed }]
 * @param {Array} input.reports 입주 전 리포트 [{ id, unitId, unitName, windowStart, unconfirmedZones: string[] }]
 *   windowStart = 제보 기간 시작일(그 리포트 날짜의 계약 시작일, 없으면 리포트 날짜)
 * @param {Array} input.settlements [{ id, unitId, unitName, leaseId, status, moveInReportId, moveOutReportId,
 *   shared: boolean, linkExpiresAt?, items: [{ payer, tenantResponse }] }]
 * @param {Array} input.tenantReports [{ id, reportId, status }]
 * @param {Date} input.now
 * @returns {Array} 정렬된 카드 (severity crit > warn > calm → dday 오름차순, 기한 없는 카드는 뒤)
 */
export function buildOwnerTodos({ leases = [], reports = [], settlements = [], tenantReports = [], now }) {
  const today = toDateString(now);
  const todos = [];
  const latest = latestByUnit(leases);

  for (const lease of leases) {
    const isLatest = latest.get(lease.unitId) === lease;
    const leaseLink = `/owner/units/${lease.unitId}/leases`;
    const toEnd = daysBetween(today, lease.endDate);

    // 퇴거 준비: 호실의 최근 계약이 60일 안에 끝나거나 지났는데 확정된 정산이 없음
    if (isLatest && toEnd <= MOVE_OUT_NOTICE_DAYS) {
      const confirmed = settlements.some((s) => s.leaseId === lease.id && s.status === 'confirmed');
      if (!confirmed) {
        todos.push(
          card('move_out', lease, {
            title: '퇴거 점검과 보증금 공제 준비',
            detail:
              toEnd < 0
                ? `계약 종료 ${-toEnd}일 지남(${lease.endDate}) · 확정된 정산 없음`
                : `계약 종료 ${lease.endDate} (${ddayLabel(toEnd)}) · 퇴거 점검 → 보증금 공제 근거`,
            dueDate: lease.endDate,
            dday: toEnd,
            severity: toEnd < 0 ? 'crit' : 'warn',
            link: '/owner/compare',
          })
        );
      }
    }

    // 특약 미확인: 끝나지 않은 계약 중 임차인이 특약을 모두 확인하지 않은 것
    if (toEnd >= 0 && !lease.tenantConfirmed) {
      todos.push(
        card('lease_unconfirmed', lease, {
          title: '임차인 특약 확인 대기',
          detail: `${lease.tenantName ?? '임차인'} · 계약 ${lease.startDate} ~ ${lease.endDate}`,
          dueDate: null,
          dday: null,
          severity: 'warn',
          link: leaseLink,
        })
      );
    }

    // 전월세 신고: 시작일(계약일로 간주) + 30일, 기한이 지나지 않았으면
    const rentDue = addDays(lease.startDate, RENT_REPORT_DAYS);
    const toRentDue = daysBetween(today, rentDue);
    if (toRentDue >= 0) {
      todos.push(
        card('rent_report', lease, {
          title: '전월세 신고 기한',
          detail: `계약일(시작일로 간주) ${lease.startDate} + ${RENT_REPORT_DAYS}일 = ${rentDue}까지 (${ddayLabel(toRentDue)}) · ${LEGAL_NOTICE}`,
          dueDate: rentDue,
          dday: toRentDue,
          severity: toRentDue <= 7 ? 'warn' : 'calm',
          link: leaseLink,
        })
      );
    }

    // 갱신 거절 통지 기간: 만료 6개월 전 ~ 2개월 전 (최근 계약, 만료 전까지)
    if (isLatest && toEnd >= 0) {
      const from = addMonths(lease.endDate, -RENEWAL_NOTICE_FROM_MONTHS);
      const to = addMonths(lease.endDate, -RENEWAL_NOTICE_TO_MONTHS);
      if (today >= from && today <= to) {
        const dday = daysBetween(today, to);
        todos.push(
          card('renewal_notice', lease, {
            title: '갱신 거절 통지 기간 중',
            detail: `통지 기간 ${from} ~ ${to} (${ddayLabel(dday)}) · 계약 만료 ${lease.endDate} · ${LEGAL_NOTICE}`,
            dueDate: to,
            dday,
            severity: 'warn',
            link: leaseLink,
          })
        );
      } else if (today > to) {
        todos.push(
          card('renewal_notice', lease, {
            title: '통지 기간 지남 · 묵시적 갱신 여부 확인',
            detail: `통지 기간 ${from} ~ ${to} 지남 · 계약 만료 ${lease.endDate} (${ddayLabel(toEnd)}) · ${LEGAL_NOTICE}`,
            dueDate: lease.endDate,
            dday: toEnd,
            severity: 'warn',
            link: leaseLink,
          })
        );
      }
    }
  }

  // 입주 제보 기간: 호실별 가장 최근(id가 큰) 입주 전 리포트의 기간이 열려 있으면
  const latestReport = new Map();
  for (const r of reports) {
    const cur = latestReport.get(r.unitId);
    if (!cur || r.id > cur.id) latestReport.set(r.unitId, r);
  }
  for (const r of latestReport.values()) {
    const w = reportWindow(r.windowStart, now);
    if (!w.open) continue;
    const pending = tenantReports.filter((t) => t.reportId === r.id && t.status === 'pending').length;
    const unconfirmed = r.unconfirmedZones.length;
    todos.push({
      kind: 'report_window',
      unitId: r.unitId,
      unitName: r.unitName,
      title: `입주 제보 승인 대기 ${pending}건 · 미확인 구역 ${unconfirmed}`,
      detail: `${w.daysLeft === 0 ? '오늘 마감' : `마감 D-${w.daysLeft}`} (${w.deadline}까지)`,
      dueDate: w.deadline,
      dday: w.daysLeft,
      severity: pending > 0 ? 'warn' : 'calm',
      link: `/owner/reports/${r.id}/tenant-reports`,
    });
  }

  // 정산: 보류(이의) crit / 링크를 보낸 뒤 임차인 응답 대기 warn. 확정된 정산은 제외
  for (const s of settlements) {
    if (s.status === 'confirmed') continue;
    const charged = s.items.filter((it) => it.payer === 'tenant');
    const objected = charged.filter((it) => it.tenantResponse === 'object').length;
    const waiting = charged.filter((it) => !it.tenantResponse).length;
    const link = `/owner/settlement?moveInReportId=${s.moveInReportId}&moveOutReportId=${s.moveOutReportId}`;
    const linkDue = s.linkExpiresAt ? toDateString(new Date(s.linkExpiresAt)) : null;
    const base = { kind: null, unitId: s.unitId, unitName: s.unitName, link };

    if (s.status === 'hold' || objected > 0) {
      todos.push({
        ...base,
        kind: 'settlement_hold',
        title: `정산 보류 · 임차인 이의 ${objected}건`,
        detail: '이의 내용을 확인하고 임대인 부담으로 돌릴지 정하세요.',
        dueDate: null,
        dday: null,
        severity: 'crit',
      });
    } else if (s.shared && waiting > 0) {
      todos.push({
        ...base,
        kind: 'settlement_waiting',
        title: `임차인 응답 대기 ${waiting}건`,
        detail: linkDue ? `확인 링크 만료 ${linkDue}` : '임차인 확인 링크를 보냈습니다.',
        dueDate: linkDue,
        dday: linkDue ? daysBetween(today, linkDue) : null,
        severity: 'warn',
      });
    }
  }

  return sortTodos(todos);
}

/** severity(crit > warn > calm) → dday 오름차순(기한 없음은 뒤) → 호실 이름. */
export function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s) return s;
    const da = a.dday ?? Infinity;
    const db = b.dday ?? Infinity;
    if (da !== db) return da < db ? -1 : 1;
    return String(a.unitName).localeCompare(String(b.unitName));
  });
}

/**
 * 호실 현황 한 줄씩.
 * @param {Array} units [{ id, name }]
 * @returns {Array} [{ unitId, unitName, leaseStatus, tenantName, nextDue }]
 *   leaseStatus 'none' | 'upcoming'(시작 전) | 'active' | 'ending'(60일 이내 종료) | 'ended'
 *   nextDue: 그 호실 카드 중 기한이 오늘 이후인 가장 가까운 것 { kind, title, dueDate, dday } | null
 */
export function buildUnitSummaries({ units = [], leases = [], todos = [], now }) {
  const today = toDateString(now);
  const latest = latestByUnit(leases);
  return units.map((u) => {
    const lease = latest.get(u.id);
    let leaseStatus = 'none';
    if (lease) {
      const toEnd = daysBetween(today, lease.endDate);
      if (today < lease.startDate) leaseStatus = 'upcoming';
      else if (toEnd < 0) leaseStatus = 'ended';
      else if (toEnd <= MOVE_OUT_NOTICE_DAYS) leaseStatus = 'ending';
      else leaseStatus = 'active';
    }
    const next = todos
      .filter((t) => t.unitId === u.id && t.dday != null && t.dday >= 0)
      .sort((a, b) => a.dday - b.dday)[0];
    return {
      unitId: u.id,
      unitName: u.name,
      leaseStatus,
      tenantName: lease?.tenantName ?? null,
      nextDue: next ? { kind: next.kind, title: next.title, dueDate: next.dueDate, dday: next.dday } : null,
    };
  });
}
