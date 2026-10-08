/**
 * House Log (창 18, 순수 함수, AI 사용 안 함).
 * 호실 하나의 계약·특약 확인·점검 리포트·입주 제보·정산 링크·임차인 응답·합의 확정·수선비 장부를
 * 이미 있는 기록에서 모아 시간순 이벤트로 만든다. 새 데이터를 만들거나 판단하지 않는다.
 *
 * 이벤트: { at, kind, title, detail, actor, link, integrity: { ok, shortHash } | null, leaseId }
 *   at = ISO 시각(UTC). 날짜만 있는 값(계약 시작·종료)은 서버 현지 자정(종료는 23:59:59)으로 둔다.
 * 수리 후 점검 리포트(창 26)는 kind 'report' 그대로 제목만 "수리 완료"이고, 스냅샷 repairOf가 있으면
 * detail에 "수리 전 리포트 #n", link는 임대인이면 수리 전↔후 비교 화면.
 */
import { toDateString } from './tenantReport.js';
import { ledgerDate } from './repairLedger.js';
import { REASON_REPAIR_CHECK } from './carryover.js';

export const HOUSE_LOG_KINDS = [
  'lease_start',
  'clauses_confirmed',
  'report',
  'carryover',
  'tenant_report',
  'settlement_link',
  'tenant_response',
  'settlement_confirmed',
  'ledger',
  'lease_end',
];
// 같은 시각이면 이 순서 (계약 시작이 먼저, 계약 종료가 마지막)
const KIND_ORDER = Object.fromEntries(HOUSE_LOG_KINDS.map((k, i) => [k, i]));

const TENANT_REPORT_STATUS = { approved: '승인', rejected: '거절', pending: '대기' };
const STATE_LABEL = { minor: '경미', damaged: '손상', broken: '파손' };
const RESPONSE_LABEL = { agree: '동의', object: '이의' };

const won = (n) => `${Number(n ?? 0).toLocaleString('ko-KR')}원`;

/**
 * 시각 문자열 → ISO(UTC).
 * 'YYYY-MM-DD' → 현지 자정(endOfDay면 23:59:59), 시간대 없는 'YYYY-MM-DD HH:MM:SS' → 현지 시각, ISO → 그대로.
 */
export function toIso(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const s = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [y, m, d] = dateOnly.slice(1).map(Number);
    return (endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d)).toISOString();
  }
  // 시간대 없는 'YYYY-MM-DD HH:MM:SS'는 현지 시각 (demoClock.sqlDateTime·시드와 같은 규칙)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const [dd, tt] = s.split(' ');
    const [y, mo, d] = dd.split('-').map(Number);
    const [h, mi, se] = tt.split(':').map(Number);
    return new Date(y, mo - 1, d, h, mi, se).toISOString();
  }
  return new Date(s).toISOString();
}

/**
 * 어떤 시각이 속한 계약 id — leaseRepo.getLeaseForDate와 같은 규칙:
 * 기간 안 → 그 전에 시작한 가장 최근 계약 → 그 뒤에 시작하는 가장 이른 계약 → null.
 */
export function leaseIdForDate(leases, at) {
  if (!at || !leases.length) return null;
  const day = toDateString(new Date(at));
  const byStartDesc = [...leases].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id);
  const inside = byStartDesc.find((l) => l.startDate <= day && l.endDate >= day);
  if (inside) return inside.id;
  const before = byStartDesc.find((l) => l.startDate <= day);
  if (before) return before.id;
  return byStartDesc.at(-1).id;
}

const integrityOf = (verify) =>
  verify ? { ok: !!verify.ok, shortHash: verify.storedHash ? verify.storedHash.slice(0, 8) : null } : null;

/** 역할별 화면 링크. 임차인 화면이 없는 곳은 null. */
function linksFor(viewer, unitId) {
  const owner = viewer === 'owner';
  const base = owner ? '/owner' : '/tenant';
  return {
    lease: owner ? `/owner/units/${unitId}/leases` : '/tenant/reports',
    report: (id) => `${base}/reports/${id}`,
    tenantReport: (reportId) => (owner ? `/owner/reports/${reportId}/tenant-reports` : `/tenant/reports/${reportId}`),
    // 수리 전↔후 비교 (창 26). 비교 화면은 임대인 화면에만 있다
    repairCompare: (preId, postId) => (owner ? `/owner/compare?leftId=${preId}&rightId=${postId}` : null),
    settlement: (s) =>
      owner ? `/owner/settlement?moveInReportId=${s.moveInReportId}&moveOutReportId=${s.moveOutReportId}` : null,
    ledger: owner ? '/owner/repair-ledger' : null,
  };
}

/**
 * @param {object} input
 * @param {{ id, name, ownerName? }} input.unit
 * @param {Array} input.leases      leaseRepo 계약 (clauses, tenantName, tenantConfirmedAt 포함)
 * @param {Array<{ id, createdAt, snapshot }>} input.reports   발행된 리포트 + 스냅샷(불변)
 * @param {Object<number, object>} input.verifies               reportId → 해시 검증 결과
 * @param {Array} input.tenantReports  [{ id, reportId, itemCode, name, state, text, status, createdAt, decidedAt }]
 * @param {Array<{ body, links, verify }>} input.settlements  정산 본문(확정이면 스냅샷) + 공유 링크 전부 + 정산서 해시 검증
 * @param {Array} input.ledgerRows  이 호실 수선비 장부 확정 행 (lib/repairLedger rows)
 * @param {Date} input.now          계약 종료가 지났는지 판단
 * @param {'owner'|'tenant'} [input.viewer]  링크 경로
 * @returns {{ unit, leases: Array<{ id, range, startDate, endDate, tenantName, tenantUserId }>, events: Array }}
 */
export function buildHouseLog({
  unit,
  leases = [],
  reports = [],
  verifies = {},
  tenantReports = [],
  settlements = [],
  ledgerRows = [],
  now = new Date(),
  viewer = 'owner',
}) {
  const link = linksFor(viewer, unit.id);
  const today = toDateString(now);
  const events = [];
  const push = (e) => e.at && events.push({ integrity: null, link: null, actor: null, ...e });

  // 계약
  for (const l of leases) {
    const clauseCount = l.clauses?.length ?? 0;
    push({
      at: toIso(l.startDate),
      kind: 'lease_start',
      title: '계약 시작',
      detail: `${l.startDate} ~ ${l.endDate} · 보증금 ${won(l.deposit)} · 특약 ${clauseCount}건`,
      actor: l.tenantName ? `임차인 ${l.tenantName}` : null,
      link: link.lease,
      leaseId: l.id,
    });
    if (clauseCount && l.tenantConfirmedAt) {
      push({
        at: toIso(l.tenantConfirmedAt),
        kind: 'clauses_confirmed',
        title: '임차인 특약 확인',
        detail: `특약 ${clauseCount}건 모두 확인`,
        actor: l.tenantName ? `임차인 ${l.tenantName}` : null,
        link: link.lease,
        leaseId: l.id,
      });
    }
    // 종료일이 지난 계약만 (앞으로의 종료는 기록이 아니다)
    if (l.endDate <= today) {
      push({
        at: toIso(l.endDate, { endOfDay: true }),
        kind: 'lease_end',
        title: '계약 종료',
        detail: `${l.startDate} ~ ${l.endDate}`,
        actor: l.tenantName ? `임차인 ${l.tenantName}` : null,
        link: link.lease,
        leaseId: l.id,
      });
    }
  }

  // 점검 리포트 (스냅샷 기준 — 발행 뒤 바뀌지 않는다)
  const reportLease = {};
  for (const r of reports) {
    const at = toIso(r.createdAt);
    const leaseId = leaseIdForDate(leases, at);
    reportLease[r.id] = leaseId;
    const snap = r.snapshot ?? {};
    const abnormal = (snap.items ?? []).filter((it) => it.state && it.state !== 'normal').length;
    const contractor = snap.parties?.contractor;
    const repairDone = snap.inspection?.type === 'repair_post';
    const repairOf = repairDone ? snap.repairOf : null;
    push({
      at,
      kind: 'report',
      title: repairDone ? '수리 완료' : `${snap.inspection?.typeLabel ?? '점검'} 리포트 발행`,
      detail: [
        repairDone ? `${snap.inspection.typeLabel ?? '수리 후 점검'} 리포트 #${r.id}` : null,
        `${snap.grade ?? '-'}등급 · 이상 ${abnormal}건`,
        repairOf ? `수리 전 리포트 #${repairOf.reportId}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      actor: contractor ? `시공업자 ${contractor.name}` : null,
      link: (repairOf && link.repairCompare(repairOf.reportId, r.id)) || link.report(r.id),
      integrity: integrityOf(verifies[r.id]),
      leaseId,
    });
    // 입주 전 점검이 이전 퇴거 기록을 가져왔으면 (창 20, 스냅샷의 carryover)
    if (snap.carryover) {
      const carried = snap.carryover.items ?? [];
      const repair = carried.filter((it) => it.reason === REASON_REPAIR_CHECK).length;
      const pending = carried.filter((it) => it.repairCheckPending).length;
      push({
        at,
        kind: 'carryover',
        title: '이전 퇴거 기록 이어받음',
        detail: [
          `퇴거 리포트 #${snap.carryover.sourceReportId}에서 ${carried.length}개 가져옴`,
          repair ? `수리 확인 ${repair}개` : null,
          pending ? `현장 확인 전 제출 ${pending}개` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        actor: contractor ? `시공업자 ${contractor.name}` : null,
        link: link.report(snap.carryover.sourceReportId),
        leaseId,
      });
    }
  }

  // 입주 제보 — 입주 리포트가 속한 계약으로 묶는다
  for (const t of tenantReports) {
    const status = TENANT_REPORT_STATUS[t.status] ?? t.status;
    push({
      at: toIso(t.createdAt),
      kind: 'tenant_report',
      title: `입주 제보 · ${t.name ?? t.itemCode}`,
      detail: [STATE_LABEL[t.state] ?? t.state, t.text, status].filter(Boolean).join(' · '),
      actor: '임차인',
      link: link.tenantReport(t.reportId),
      leaseId: reportLease[t.reportId] ?? leaseIdForDate(leases, toIso(t.createdAt)),
    });
  }

  // 정산 — 정산이 쓰는 계약(입주 리포트 날짜 기준)으로 묶는다
  const confirmedAtById = {};
  for (const { body, links = [], verify } of settlements) {
    const leaseId = body.leaseId ?? leaseIdForDate(leases, toIso(body.createdAt));
    const sLink = link.settlement(body);
    for (const l of links) {
      push({
        at: toIso(l.createdAt),
        kind: 'settlement_link',
        title: '임차인 정산 링크 생성',
        detail: `만료 ${ledgerDate(l.expiresAt)}`,
        actor: '임대인',
        link: sLink,
        leaseId,
      });
      if (l.firstViewedAt) {
        push({
          at: toIso(l.firstViewedAt),
          kind: 'settlement_link',
          title: '임차인 정산 링크 최초 열람',
          detail: '임차인이 링크를 처음 열었습니다',
          actor: '임차인',
          link: sLink,
          leaseId,
        });
      }
    }
    for (const it of body.items ?? []) {
      if (!it.tenantResponse || !it.tenantRespondedAt) continue;
      push({
        at: toIso(it.tenantRespondedAt),
        kind: 'tenant_response',
        title: `임차인 ${RESPONSE_LABEL[it.tenantResponse] ?? it.tenantResponse} · ${it.name}`,
        detail: it.tenantResponseText || `${it.zone} · 청구 ${won(it.tenantAmount)}`,
        actor: '임차인',
        link: sLink,
        leaseId,
      });
    }
    if (body.status === 'confirmed' && body.confirmedAt) {
      confirmedAtById[body.id] = { at: toIso(body.confirmedAt), leaseId };
      push({
        at: toIso(body.confirmedAt),
        kind: 'settlement_confirmed',
        title: '정산 합의 확정',
        detail: `임차인 청구 ${won(body.totals?.tenantTotal)} · 반환 ${won(body.totals?.depositReturn)}`,
        actor: '임대인',
        link: sLink,
        integrity: integrityOf(verify),
        leaseId,
      });
    }
  }

  // 수선비 장부 — 확정 스냅샷의 임대인 부담 항목 (확정 시각에 반영)
  for (const row of ledgerRows) {
    const c = confirmedAtById[row.settlementId];
    push({
      at: c?.at ?? toIso(row.date),
      kind: 'ledger',
      title: `수선비 장부 반영 · ${row.itemName}`,
      detail: `${won(row.amount)} · ${row.reason}`,
      actor: '임대인',
      link: link.ledger,
      leaseId: c?.leaseId ?? leaseIdForDate(leases, toIso(row.date)),
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return {
    unit: { id: unit.id, name: unit.name },
    leases: [...leases]
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
      .map((l) => ({
        id: l.id,
        range: `${l.startDate} ~ ${l.endDate}`,
        startDate: l.startDate,
        endDate: l.endDate,
        tenantName: l.tenantName,
        tenantUserId: l.tenantUserId,
      })),
    events,
  };
}

/**
 * 임차인용 (창 18): 본인 계약 기간의 이벤트만. 다른 임차인의 보증금·응답과 임대인 장부는 보내지 않는다.
 * 계약에 묶이지 않은 이벤트(leaseId null)도 뺀다.
 */
export function filterHouseLogForTenant(log, tenantUserId) {
  const own = log.leases.filter((l) => l.tenantUserId === tenantUserId);
  const ids = new Set(own.map((l) => l.id));
  return {
    ...log,
    leases: own,
    events: log.events.filter((e) => ids.has(e.leaseId) && e.kind !== 'ledger'),
  };
}
