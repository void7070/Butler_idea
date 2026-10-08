import { Router } from 'express';
import { requireUser } from '../middleware/currentUser.js';
import { requireFields, validateImageBatch } from '../lib/validation.js';
import { errors } from '../lib/errors.js';
import { INSPECTION_TYPE_CODES, flowForType } from '../domain/inspectionTypes.js';
import { normalizeBaselineInput, normalizeZones, validateBaselineSubmission } from '../lib/baseline.js';
import {
  createInspection,
  getInspectionById,
  updateInspection,
  deleteInspection,
  listInspectionsForUser,
} from '../repositories/inspectionRepo.js';
import { submitInspection, getReportRow } from '../repositories/reportRepo.js';
import { normalizeCarryoverInput, assertCarryoverTarget } from '../lib/carryover.js';
import { validateRepairSubmission, assertRepairLink, normalizeRepairLinkInput } from '../lib/repairGate.js';
import { sqlDateTime } from '../lib/demoClock.js';

function assertValidType(type) {
  if (!INSPECTION_TYPE_CODES.includes(type)) {
    throw errors.badRequest(`알 수 없는 점검 유형: ${type}`, 'INVALID_TYPE');
  }
}

function assertUnitExists(db, unitId) {
  const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(Number(unitId));
  if (!unit) throw errors.notFound('호실을 찾을 수 없습니다.');
}

/** 점검 접근은 작성한 시공업자 본인만 (owner/tenant는 리포트로만 접근 — B07) */
function assertAuthor(inspection, user) {
  if (inspection.created_by !== user.id) {
    throw errors.forbidden('해당 점검에 접근할 권한이 없습니다.');
  }
}

/** reported 상태는 수정/삭제 불가 (생성 완료 리포트의 점검은 불변) */
function assertEditable(inspection) {
  if (inspection.status === 'reported') {
    throw errors.badRequest(
      '리포트가 생성된 점검은 수정하거나 삭제할 수 없습니다.',
      'REPORTED_LOCKED'
    );
  }
}

/**
 * 생성/수정 본문에서 자식 컬렉션을 꺼낸다. baseline이면 이상 항목만 남기고
 * 항목 코드·상태·구역을 검증한다. 들어오지 않은 컬렉션은 undefined로 둔다(독립 교체 규칙).
 */
function childrenFromBody(body, flow, existingItems = []) {
  const { items, images, observations, zonesConfirmed } = body;
  if (flow !== 'baseline') return { items, images, observations };
  return {
    ...normalizeBaselineInput({ items, images, observations }, existingItems),
    zonesConfirmed: zonesConfirmed === undefined ? undefined : normalizeZones(zonesConfirmed ?? []),
  };
}

export function createInspectionsRouter(db, { now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());

  // 본인이 작성한 점검 목록 (시공업자 홈)
  router.get('/', requireUser, (req, res) => {
    const inspections = req.user.role === 'contractor' ? listInspectionsForUser(db, req.user.id) : [];
    res.ok({ inspections });
  });

  // 점검 생성 (시공업자만)
  router.post('/', requireUser, (req, res) => {
    requireFields(req.body, ['unitId', 'type']);
    if (req.user.role !== 'contractor') {
      throw errors.forbidden('점검 생성은 시공업자만 가능합니다.');
    }
    assertValidType(req.body.type);
    assertUnitExists(db, req.body.unitId);
    const children = childrenFromBody(req.body, flowForType(req.body.type));
    validateImageBatch(children.images ?? []);

    const inspection = createInspection(db, {
      unitId: Number(req.body.unitId),
      createdBy: req.user.id,
      type: req.body.type,
      ...children,
      finalOpinion: req.body.finalOpinion,
    });
    res.ok({ inspection }, 201);
  });

  // 점검 상세
  router.get('/:id', requireUser, (req, res) => {
    const inspection = getInspectionById(db, Number(req.params.id));
    if (!inspection) throw errors.notFound('점검을 찾을 수 없습니다.');
    assertAuthor(inspection, req.user);
    res.ok({ inspection });
  });

  // 점검 수정 (draft/submitted만)
  router.patch('/:id', requireUser, (req, res) => {
    const inspection = getInspectionById(db, Number(req.params.id));
    if (!inspection) throw errors.notFound('점검을 찾을 수 없습니다.');
    assertAuthor(inspection, req.user);
    assertEditable(inspection);
    if (req.body.type !== undefined) assertValidType(req.body.type);
    const flow = req.body.type !== undefined ? flowForType(req.body.type) : inspection.flow;
    const children = childrenFromBody(req.body, flow, inspection.items);
    if (children.images !== undefined) validateImageBatch(children.images);

    // 이전 퇴거 기록 가져오기 (창 20): 입주 전 점검 + 같은 호실 퇴거 리포트만
    let carryover;
    if (req.body.carryover !== undefined) {
      carryover = normalizeCarryoverInput(req.body.carryover);
      if (carryover) {
        assertCarryoverTarget({ ...inspection, type: req.body.type ?? inspection.type }, getReportRow(db, carryover.sourceReportId));
      }
    }

    // 수리 후 점검 ↔ 수리 전 리포트 연결 (창 26): 수리 후 점검 + 같은 호실 수리 전 리포트만
    let repairPreReportId;
    if (req.body.repairPreReportId !== undefined) {
      repairPreReportId = normalizeRepairLinkInput(req.body.repairPreReportId);
      if (repairPreReportId) {
        assertRepairLink({ ...inspection, type: req.body.type ?? inspection.type }, getReportRow(db, repairPreReportId));
      }
    } else if (req.body.type !== undefined && req.body.type !== 'repair_post' && inspection.repairPreReportId) {
      repairPreReportId = null; // 수리 후가 아닌 유형으로 바꾸면 연결도 푼다
    }

    const updated = updateInspection(db, inspection.id, {
      type: req.body.type,
      finalOpinion: req.body.finalOpinion,
      carryover,
      repairPreReportId,
      ...children,
    });
    res.ok({ inspection: updated });
  });

  // 점검 삭제 (draft/submitted만)
  router.delete('/:id', requireUser, (req, res) => {
    const inspection = getInspectionById(db, Number(req.params.id));
    if (!inspection) throw errors.notFound('점검을 찾을 수 없습니다.');
    assertAuthor(inspection, req.user);
    assertEditable(inspection);

    deleteInspection(db, inspection.id);
    res.ok({ deleted: true });
  });

  // 점검 제출 → 리포트 자동 생성 (B05)
  router.post('/:id/submit', requireUser, (req, res) => {
    const inspection = getInspectionById(db, Number(req.params.id));
    if (!inspection) throw errors.notFound('점검을 찾을 수 없습니다.');
    assertAuthor(inspection, req.user);
    if (inspection.status === 'reported') {
      throw errors.badRequest('이미 리포트가 생성된 점검입니다.', 'ALREADY_REPORTED');
    }
    if (inspection.flow === 'baseline') validateBaselineSubmission(inspection);
    validateRepairSubmission(inspection); // 수리 전·후만 항목별 사진 필수 (창 26)

    // 발행 시각은 서버의 "지금"(시연 기준일, 창 17)
    const reportId = submitInspection(db, inspection.id, sqlDateTime(clock()));
    res.ok({ reportId }, 201);
  });

  return router;
}
