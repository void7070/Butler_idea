import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { buildHouseLog, filterHouseLogForTenant } from '../lib/houseLog.js';
import { buildRepairLedger } from '../lib/repairLedger.js';
import { isUnitParty, listLeasesByUnitId } from '../repositories/leaseRepo.js';
import { getSnapshotByReportId, verifyReportSnapshot } from '../repositories/reportRepo.js';
import { listTenantReports } from '../repositories/tenantReportRepo.js';
import {
  getSettlementSnapshot,
  verifySettlementSnapshot,
  listSettlementShareLinks,
} from '../repositories/settlementRepo.js';
import { computeSettlementBody } from './settlements.js';

/**
 * GET /api/units/:id/house-log (창 18). 그 호실의 owner/tenant만(시공업자 403).
 * 이미 있는 기록(계약·리포트 스냅샷·입주 제보·정산·링크·응답·확정 스냅샷·장부)을 모아 lib/houseLog.js로 만든다.
 * tenant는 본인 계약 기간의 이벤트만 받는다.
 */
export function registerHouseLogRoute(router, db, { now } = {}) {
  const clock = now ?? (() => new Date());

  router.get('/units/:id/house-log', requireUser, (req, res) => {
    const unitId = Number(req.params.id);
    const unit = db.prepare('SELECT id, name FROM units WHERE id = ?').get(unitId);
    if (!unit) throw errors.notFound('호실을 찾을 수 없습니다.');
    if (!isUnitParty(db, unitId, req.user)) throw errors.forbidden('이 호실의 기록을 볼 권한이 없습니다.');

    const log = buildHouseLog({ ...collectHouseLogInput(db, unit), now: clock(), viewer: req.user.role });
    res.ok(req.user.role === 'tenant' ? filterHouseLogForTenant(log, req.user.id) : log);
  });
}

/** 호실 → buildHouseLog 입력 (읽기만 한다). */
export function collectHouseLogInput(db, unit) {
  const reportRows = db.prepare('SELECT id, type, created_at FROM reports WHERE unit_id = ? ORDER BY id').all(unit.id);
  const reports = reportRows.map((r) => ({ id: r.id, createdAt: r.created_at, snapshot: getSnapshotByReportId(db, r.id) }));
  const verifies = Object.fromEntries(reportRows.map((r) => [r.id, verifyReportSnapshot(db, r.id)]));
  const tenantReports = reportRows.filter((r) => r.type === 'move_in').flatMap((r) => listTenantReports(db, r.id));

  const settlements = [];
  const confirmed = [];
  for (const row of db.prepare('SELECT * FROM settlements WHERE unit_id = ? ORDER BY id').all(unit.id)) {
    // 확정 정산은 동결된 스냅샷 그대로(다시 계산하지 않음, 창 15)
    const frozen = row.status === 'confirmed' ? getSettlementSnapshot(db, row.id) : null;
    const body = frozen ?? computeSettlementBody(db, row);
    const verify = frozen ? verifySettlementSnapshot(db, row.id) : null;
    settlements.push({ body, links: listSettlementShareLinks(db, row.id), verify });
    if (row.status === 'confirmed') confirmed.push({ snapshot: body, hashOk: verify ? verify.ok : null });
  }

  return {
    unit,
    leases: listLeasesByUnitId(db, unit.id),
    reports,
    verifies,
    tenantReports,
    settlements,
    ledgerRows: buildRepairLedger({ confirmed, filter: { unitId: unit.id } }).rows,
  };
}
