import { Router } from 'express';
import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { requireFields } from '../lib/validation.js';
import { reportWindow, assertWindowOpen, normalizeTenantReport, zoneStatus } from '../lib/tenantReport.js';
import { ZONES } from '../domain/itemCatalog.js';
import { getReportRow } from '../repositories/reportRepo.js';
import { sqlDateTime } from '../lib/demoClock.js';
import { getLeaseForDate, isUnitParty } from '../repositories/leaseRepo.js';
import {
  createTenantReport,
  getTenantReport,
  listTenantReports,
  decideTenantReport,
  listZoneConfirmations,
  confirmTenantZone,
} from '../repositories/tenantReportRepo.js';

/**
 * 임차인 입주 제보 (창 10).
 * - 임차인: 계약 시작일부터 7일 안에 입주 리포트에 이상 제보 / 구역 확인. 지나면 400 "제보 기간이 끝났습니다".
 * - 임대인: 제보 목록 조회, 승인·거절 (기간과 상관없이 pending만).
 * 권한은 unit_users 기준으로 백엔드가 판단한다.
 */

/** 입주 전 리포트 + 그 호실 owner/tenant인지 확인. */
function loadMoveInReport(db, id, user) {
  const report = getReportRow(db, Number(id));
  if (!report) throw errors.notFound('리포트를 찾을 수 없습니다.');
  if (!isUnitParty(db, report.unit_id, user)) throw errors.forbidden('이 리포트의 입주 제보에 접근할 권한이 없습니다.');
  if (report.type !== 'move_in') throw errors.badRequest('입주 전 리포트에만 제보할 수 있습니다.', 'NOT_MOVE_IN');
  return report;
}

function requireTenant(user) {
  if (user.role !== 'tenant') throw errors.forbidden('임차인만 제보·구역 확인을 할 수 있습니다.');
}

/** 제보 기간: 계약 시작일(없으면 입주 리포트 날짜)부터 7일. 계약은 입주 리포트 날짜에 해당하는 것(창 12). */
function windowFor(db, report, now) {
  const start = getLeaseForDate(db, report.unit_id, report.created_at)?.startDate ?? report.created_at;
  return reportWindow(start, now);
}

/** /api/reports/:id/... 에 붙는 라우트 (reports 라우터 안에서 등록). */
export function registerReportTenantRoutes(router, db, { now } = {}) {
  const clock = now ?? (() => new Date());

  // 제보 목록 + 구역 확인 현황 + 제보 기간 (그 호실 owner/tenant)
  router.get('/:id/tenant-reports', (req, res) => {
    const report = loadMoveInReport(db, req.params.id, req.user);
    res.ok({
      reportId: report.id,
      window: windowFor(db, report, clock()),
      ...zoneStatus(ZONES, listZoneConfirmations(db, report.inspection_id)),
      tenantReports: listTenantReports(db, report.id),
    });
  });

  // 임차인 이상 제보
  router.post('/:id/tenant-reports', (req, res) => {
    requireTenant(req.user);
    const report = loadMoveInReport(db, req.params.id, req.user);
    assertWindowOpen(windowFor(db, report, clock()));
    const input = normalizeTenantReport(req.body);
    const id = createTenantReport(db, report.id, input, sqlDateTime(clock()));
    res.ok({ tenantReport: getTenantReport(db, id) }, 201);
  });

  // 임차인 구역 확인 → zone_confirmations(role='tenant')
  router.post('/:id/zone-confirm', (req, res) => {
    requireTenant(req.user);
    const report = loadMoveInReport(db, req.params.id, req.user);
    assertWindowOpen(windowFor(db, report, clock()));
    requireFields(req.body, ['zone']);
    if (!ZONES.includes(req.body.zone)) throw errors.badRequest('알 수 없는 구역입니다.', 'INVALID_ZONE');
    confirmTenantZone(db, report.inspection_id, req.body.zone);
    res.ok(zoneStatus(ZONES, listZoneConfirmations(db, report.inspection_id)));
  });
}

/** /api/tenant-reports/:id/approve · /reject (그 호실 임대인만). */
export function createTenantReportsRouter(db, { now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());
  router.use(requireUser);

  const decide = (status) => (req, res) => {
    const tr = getTenantReport(db, Number(req.params.id));
    if (!tr) throw errors.notFound('제보를 찾을 수 없습니다.');
    const report = getReportRow(db, tr.reportId);
    if (req.user.role !== 'owner' || !isUnitParty(db, report.unit_id, req.user)) {
      throw errors.forbidden('제보는 그 호실의 임대인만 승인·거절할 수 있습니다.');
    }
    if (!decideTenantReport(db, tr.id, status, sqlDateTime(clock()))) {
      throw errors.badRequest('이미 처리된 제보입니다.', 'ALREADY_DECIDED');
    }
    res.ok({ tenantReport: getTenantReport(db, tr.id) });
  };

  router.post('/:id/approve', decide('approved'));
  router.post('/:id/reject', decide('rejected'));
  return router;
}
