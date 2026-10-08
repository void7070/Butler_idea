import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { buildCarryover, latestMoveOutReport } from '../lib/carryover.js';
import { isUnitParty } from '../repositories/leaseRepo.js';
import { getSnapshotByReportId } from '../repositories/reportRepo.js';
import { getSettlementSnapshot, listSettlementItems } from '../repositories/settlementRepo.js';

/**
 * GET /api/units/:id/baseline-carryover (창 20). 시공업자(모든 호실 점검 주체) 또는 그 호실 owner만.
 * 가장 최근 퇴거 전/후 리포트의 이상 항목 → 다음 입주 전 점검 제안 상태 (lib/carryover.js). 읽기만 한다.
 */
export function registerCarryoverRoute(router, db) {
  router.get('/units/:id/baseline-carryover', requireUser, (req, res) => {
    const unitId = Number(req.params.id);
    const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(unitId);
    if (!unit) throw errors.notFound('호실을 찾을 수 없습니다.');
    const allowed = req.user.role === 'contractor' || (req.user.role === 'owner' && isUnitParty(db, unitId, req.user));
    if (!allowed) throw errors.forbidden('이 호실의 이전 퇴거 기록을 가져올 권한이 없습니다.');

    const reports = db.prepare('SELECT id, type, created_at FROM reports WHERE unit_id = ?').all(unitId);
    const sourceReport = latestMoveOutReport(reports);
    if (!sourceReport) throw errors.notFound('이 호실에는 이전 퇴거 리포트가 없습니다.', 'NO_PREVIOUS_MOVE_OUT');

    res.ok(
      buildCarryover({
        sourceReport,
        moveOutSnapshot: getSnapshotByReportId(db, sourceReport.id),
        settlement: settlementFor(db, sourceReport.id),
      })
    );
  });
}

/** 그 퇴거 리포트의 최근 정산. 확정이면 동결 스냅샷의 항목(재계산 안 함, 창 15), 아니면 저장된 항목. */
function settlementFor(db, moveOutReportId) {
  const row = db
    .prepare('SELECT * FROM settlements WHERE move_out_report_id = ? ORDER BY id DESC LIMIT 1')
    .get(moveOutReportId);
  if (!row) return null;
  const frozen = row.status === 'confirmed' ? getSettlementSnapshot(db, row.id) : null;
  return { id: row.id, status: row.status, items: frozen ? frozen.items : listSettlementItems(db, row.id) };
}
