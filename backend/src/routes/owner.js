import { Router } from 'express';
import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { buildOwnerTodos, buildUnitSummaries } from '../lib/todos.js';
import { zoneStatus } from '../lib/tenantReport.js';
import { ZONES } from '../domain/itemCatalog.js';
import { getAccessibleUnits } from '../repositories/unitRepo.js';
import { getLeaseForDate, listLeasesByUnitId } from '../repositories/leaseRepo.js';
import {
  listSettlementItems,
  latestSettlementShareLink,
  getSettlementSnapshot,
  verifySettlementSnapshot,
} from '../repositories/settlementRepo.js';
import { computeSettlementBody } from './settlements.js';
import { buildRepairLedger, toCsv, parseLedgerFilter } from '../lib/repairLedger.js';
import { listTenantReports, listZoneConfirmations } from '../repositories/tenantReportRepo.js';

/**
 * 임대인 홈 (창 13). GET /api/owner/todos — owner만, 아니면 403.
 * 본인 호실(unit_users owner)의 계약·입주 리포트·정산·제보를 모아 lib/todos.js로 계산한다.
 */
export function createOwnerRouter(db, { now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());
  router.use(requireUser);

  router.get('/todos', (req, res) => {
    if (req.user.role !== 'owner') throw errors.forbidden('임대인만 할 일을 볼 수 있습니다.');
    const units = getAccessibleUnits(db, req.user.id);
    const input = collectTodoInput(db, units);
    const at = clock();
    const todos = buildOwnerTodos({ ...input, now: at });
    res.ok({ todos, units: buildUnitSummaries({ units, leases: input.leases, todos, now: at }) });
  });

  // 수선비 장부 (창 16). 확정 정산 스냅샷의 임대인 부담 항목 + 확정 전 "예정". ?year=&unitId=
  router.get('/repair-ledger', (req, res) => {
    const { units, ledger } = loadLedger(db, req);
    res.ok({
      rows: ledger.rows,
      pending: ledger.pending,
      totals: ledger.totals,
      years: ledger.years,
      units: units.map((u) => ({ id: u.id, name: u.name })),
    });
  });

  // 같은 장부를 CSV로 (UTF-8 BOM, 헤더, 마지막 줄 합계). 외부 전송 없음 — 내려받기만
  router.get('/repair-ledger.csv', (req, res) => {
    const { ledger, filter } = loadLedger(db, req);
    const name = ['repair-ledger', filter.year, filter.unitId && `unit${filter.unitId}`].filter(Boolean).join('-');
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${name}.csv"`)
      .send(toCsv(ledger));
  });

  return router;
}

/** 권한(owner, 본인 호실) 확인 + 장부 계산. */
function loadLedger(db, req) {
  if (req.user.role !== 'owner') throw errors.forbidden('임대인만 수선비 장부를 볼 수 있습니다.');
  const filter = parseLedgerFilter(req.query);
  if (filter.error) throw errors.badRequest(`${filter.error} 값이 올바르지 않습니다.`, 'VALIDATION');
  const units = getAccessibleUnits(db, req.user.id);
  if (filter.unitId != null && !units.some((u) => u.id === filter.unitId)) {
    throw errors.forbidden('이 호실의 장부를 볼 권한이 없습니다.');
  }

  const confirmed = [];
  const drafts = [];
  for (const unit of units) {
    for (const row of db.prepare('SELECT * FROM settlements WHERE unit_id = ? ORDER BY id').all(unit.id)) {
      if (row.status !== 'confirmed') {
        drafts.push(computeSettlementBody(db, row));
        continue;
      }
      // 확정 정산은 스냅샷 그대로(다시 계산하지 않음). 변조돼도 보여 주되 hashOk로 표시한다
      const snapshot = getSettlementSnapshot(db, row.id);
      if (snapshot) confirmed.push({ snapshot, hashOk: verifySettlementSnapshot(db, row.id).ok });
      else confirmed.push({ snapshot: computeSettlementBody(db, row), hashOk: null }); // 해시 도입 전 확정분
    }
  }
  return { units, filter, ledger: buildRepairLedger({ confirmed, drafts, filter }) };
}

/** 호실 목록 → buildOwnerTodos 입력. */
function collectTodoInput(db, units) {
  const leases = [];
  const reports = [];
  const settlements = [];
  const tenantReports = [];

  for (const unit of units) {
    for (const l of listLeasesByUnitId(db, unit.id)) {
      leases.push({
        id: l.id,
        unitId: unit.id,
        unitName: unit.name,
        tenantName: l.tenantName,
        startDate: l.startDate,
        endDate: l.endDate,
        tenantConfirmed: l.tenantConfirmed,
      });
    }

    const moveIns = db
      .prepare("SELECT id, inspection_id, created_at FROM reports WHERE unit_id = ? AND type = 'move_in' ORDER BY id")
      .all(unit.id);
    for (const r of moveIns) {
      // 제보 기간 시작 = 리포트 날짜의 계약 시작일(없으면 리포트 날짜) — routes/tenantReports.js와 같은 규칙
      const windowStart = getLeaseForDate(db, unit.id, r.created_at)?.startDate ?? r.created_at;
      const { unconfirmedZones } = zoneStatus(ZONES, listZoneConfirmations(db, r.inspection_id));
      reports.push({ id: r.id, unitId: unit.id, unitName: unit.name, windowStart, unconfirmedZones });
      for (const t of listTenantReports(db, r.id)) tenantReports.push({ id: t.id, reportId: t.reportId, status: t.status });
    }

    const rows = db.prepare('SELECT * FROM settlements WHERE unit_id = ? ORDER BY id').all(unit.id);
    for (const s of rows) {
      const moveIn = db.prepare('SELECT created_at FROM reports WHERE id = ?').get(s.move_in_report_id);
      const link = latestSettlementShareLink(db, s.id);
      settlements.push({
        id: s.id,
        unitId: unit.id,
        unitName: unit.name,
        leaseId: moveIn ? getLeaseForDate(db, unit.id, moveIn.created_at)?.id ?? null : null,
        status: s.status,
        moveInReportId: s.move_in_report_id,
        moveOutReportId: s.move_out_report_id,
        shared: !!link,
        linkExpiresAt: link?.expiresAt ?? null,
        items: listSettlementItems(db, s.id).map((it) => ({ payer: it.payer, tenantResponse: it.tenantResponse })),
      });
    }
  }

  return { leases, reports, settlements, tenantReports };
}
