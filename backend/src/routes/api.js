import { Router } from 'express';
import { makeLoadUser, requireUser } from '../middleware/currentUser.js';
import { listUsers, getUserById } from '../repositories/userRepo.js';
import { getAccessibleUnits } from '../repositories/unitRepo.js';
import { requireFields } from '../lib/validation.js';
import { errors } from '../lib/errors.js';
import { createInspectionsRouter } from './inspections.js';
import { createAiRouter } from './ai.js';
import { createReportsRouter } from './reports.js';
import { createSettlementsRouter, createSettlementShareRouter } from './settlements.js';
import { createTenantReportsRouter } from './tenantReports.js';
import { createOwnerRouter } from './owner.js';
import { registerHouseLogRoute } from './houseLog.js';
import { registerCarryoverRoute } from './carryover.js';
import { getShareLink, getSnapshotByReportId, verifyReportSnapshot } from '../repositories/reportRepo.js';
import { assertShareLinkUsable } from '../lib/settlementShare.js';
import { ZONES, ITEM_CATALOG } from '../domain/itemCatalog.js';
import {
  getLeaseByUnitId,
  getLeaseById,
  listLeasesByUnitId,
  createLease,
  confirmLeaseClauses,
  linkUnitTenant,
  isUnitParty,
} from '../repositories/leaseRepo.js';
import { CLAUSE_TEMPLATES } from '../domain/clauseTemplates.js';
import { normalizeLeaseInput, periodsOverlap } from '../lib/leaseInput.js';
import { maskReportSnapshot } from '../lib/maskName.js';

/**
 * /api 하위 라우터. db와 deps(예: aiComplete)를 주입받아 closure로 사용한다.
 * 이후 세션에서 reports/share 라우터를 여기에 추가한다.
 */
export function createApiRouter(db, deps = {}) {
  const router = Router();

  // 모든 /api 요청에서 현재 사용자를 로드 (있으면 req.user)
  router.use(makeLoadUser(db));

  // 데모 사용자 목록 (선택 화면용 — 인증 불필요)
  router.get('/demo/users', (req, res) => {
    res.ok({ users: listUsers(db) });
  });

  // 선택한 사용자 확인 (localStorage 저장 전 검증용)
  router.post('/session/select-user', (req, res) => {
    requireFields(req.body, ['userId']);
    const user = getUserById(db, Number(req.body.userId));
    if (!user) throw errors.notFound('사용자를 찾을 수 없습니다.');
    res.ok({ user });
  });

  // 항목 코드 카탈로그 (입주·퇴거 공통, 인증 불필요)
  router.get('/item-catalog', (req, res) => {
    res.ok({ zones: ZONES, items: ITEM_CATALOG });
  });

  // 현재 사용자가 접근 가능한 호실 (역할별)
  router.get('/units', requireUser, (req, res) => {
    res.ok({ units: getAccessibleUnits(db, req.user.id) });
  });

  // 호실 계약 + 특약 (창 6). 그 호실의 owner/tenant만, 아니면 403
  router.get('/units/:id/lease', requireUser, (req, res) => {
    const unitId = Number(req.params.id);
    if (!isUnitParty(db, unitId, req.user)) throw errors.forbidden('이 호실의 계약을 볼 권한이 없습니다.');
    const lease = getLeaseByUnitId(db, unitId);
    if (!lease) throw errors.notFound('이 호실의 계약이 없습니다.');
    res.ok({ lease });
  });

  // 특약 템플릿 목록 (창 12, 계약 등록 화면 칩용, 인증 불필요)
  router.get('/clause-templates', (req, res) => {
    res.ok({
      templates: CLAUSE_TEMPLATES.map(({ code, title, applyMode, defaultParams, defaultText }) => ({
        code,
        title,
        applyMode,
        defaultParams,
        defaultText,
      })),
    });
  });

  // 호실 계약 이력 (창 12). owner는 전체, tenant는 본인 계약만. 최신 시작일 먼저
  router.get('/units/:id/leases', requireUser, (req, res) => {
    const unitId = Number(req.params.id);
    if (!isUnitParty(db, unitId, req.user)) throw errors.forbidden('이 호실의 계약을 볼 권한이 없습니다.');
    const tenantUserId = req.user.role === 'tenant' ? req.user.id : null;
    res.ok({ leases: listLeasesByUnitId(db, unitId, { tenantUserId }) });
  });

  // 계약·특약 등록 (창 12). 그 호실 owner만
  router.post('/units/:id/leases', requireUser, (req, res) => {
    const unitId = Number(req.params.id);
    if (req.user.role !== 'owner' || !isUnitParty(db, unitId, req.user)) {
      throw errors.forbidden('이 호실의 임대인만 계약을 등록할 수 있습니다.');
    }
    const input = normalizeLeaseInput(req.body);

    const tenant = getUserById(db, input.tenantUserId);
    if (!tenant || tenant.role !== 'tenant') throw errors.badRequest('임차인 역할의 사용자를 선택해 주세요.', 'INVALID_TENANT');

    const clash = listLeasesByUnitId(db, unitId).find((l) => periodsOverlap(l, input));
    if (clash) {
      throw errors.badRequest(
        `기존 계약(${clash.startDate} ~ ${clash.endDate})과 기간이 겹칩니다.`,
        'LEASE_OVERLAP'
      );
    }

    const leaseId = db.transaction(() => {
      const id = createLease(db, { ...input, unitId, ownerUserId: req.user.id }, input.clauses);
      linkUnitTenant(db, unitId, input.tenantUserId);
      return id;
    })();
    res.ok({ lease: getLeaseById(db, leaseId) }, 201);
  });

  // 임차인 계약·특약 확인 (창 12). 그 계약의 임차인만. 이미 확인한 특약은 시각을 바꾸지 않는다
  router.post('/leases/:id/confirm', requireUser, (req, res) => {
    const lease = getLeaseById(db, Number(req.params.id));
    if (!lease) throw errors.notFound('계약을 찾을 수 없습니다.');
    if (req.user.role !== 'tenant' || lease.tenantUserId !== req.user.id) {
      throw errors.forbidden('이 계약의 임차인만 특약을 확인할 수 있습니다.');
    }
    const now = deps.now ? deps.now() : new Date();
    confirmLeaseClauses(db, lease.id, now.toISOString());
    res.ok({ lease: getLeaseById(db, lease.id) });
  });

  // House Log (창 18). 호실의 모든 기록을 시간순으로. owner/tenant(본인 계약 기간만)
  registerHouseLogRoute(router, db, { now: deps.now });

  // 다음 입주 기준선 가져오기 (창 20). 시공업자·그 호실 owner
  registerCarryoverRoute(router, db);

  // 점검 CRUD (B04)
  router.use('/inspections', createInspectionsRouter(db, { now: deps.now }));

  // AI 점검 도우미 (B06)
  router.use('/ai', createAiRouter(db, { aiComplete: deps.aiComplete }));

  // 리포트 조회/확인/공유 (B07)
  router.use('/reports', createReportsRouter(db, { now: deps.now }));

  // 임차인 입주 제보 승인·거절 (창 10, 임대인만)
  router.use('/tenant-reports', createTenantReportsRouter(db, { now: deps.now }));

  // 보증금 공제 근거 정산 (창 7). 수정은 임대인만, 임차인은 조회
  router.use('/settlements', createSettlementsRouter(db, { now: deps.now }));

  // 임대인 홈 "오늘 할 일" (창 13, owner만)
  router.use('/owner', createOwnerRouter(db, { now: deps.now }));

  // 임차인 정산 링크 (창 11, 비인증 · 7일 만료). /share/:token 보다 먼저
  router.use('/share/settlement', createSettlementShareRouter(db, { now: deps.now }));

  // 공유 링크 리포트 조회 (비인증, 7일 뒤 만료 → 410). 참여자 이름은 응답에서만 가린다(창 27, 스냅샷·해시 불변)
  router.get('/share/:token', (req, res) => {
    const link = getShareLink(db, req.params.token);
    assertShareLinkUsable(link, deps.now ? deps.now() : new Date());
    // 공유 화면 뱃지용 해시 검증 (창 9). 공유 화면은 비인증이라 /reports/:id/verify 대신 함께 보낸다
    res.ok({
      report: maskReportSnapshot(getSnapshotByReportId(db, link.reportId)),
      verify: verifyReportSnapshot(db, link.reportId),
      expiresAt: link.expiresAt,
    });
  });

  return router;
}
