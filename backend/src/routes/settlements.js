import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { requireFields } from '../lib/validation.js';
import { diffBaseline } from '../lib/diff.js';
import {
  computeSettlement,
  defaultPayer,
  applySmallBulk,
  conditionalClausesFor,
  PAYERS,
  SMALL_BULK_THRESHOLD,
} from '../lib/settlement.js';
import {
  shareExpiresAt,
  isShareExpired,
  assertShareLinkUsable,
  normalizeTenantResponse,
  settlementStatus,
  confirmCheck,
  assertEditableAfterResponse,
  shareMessage,
} from '../lib/settlementShare.js';
import { buildEvidencePackage } from '../lib/evidencePackage.js';
import { ITEM_CATALOG, ZONES, getItem } from '../domain/itemCatalog.js';
import { getReportRow, getSnapshotByReportId, verifyReportSnapshot } from '../repositories/reportRepo.js';
import { getLeaseForDate, getLeaseById, isUnitParty } from '../repositories/leaseRepo.js';
import { diffExtrasFor, listTenantReports, listZoneConfirmations } from '../repositories/tenantReportRepo.js';
import {
  findSettlementByPair,
  createSettlement,
  getSettlementRow,
  listSettlementItems,
  updateSettlementItem,
  setSettlementStatus,
  confirmSettlement,
  recordTenantResponse,
  createSettlementShareLink,
  getSettlementShareLink,
  latestSettlementShareLink,
  markShareLinkViewed,
  insertSettlementSnapshot,
  getSettlementSnapshot,
  verifySettlementSnapshot,
} from '../repositories/settlementRepo.js';

const MOVE_OUT_TYPES = ['move_out_pre', 'move_out_post'];

/**
 * 입주·퇴거 스냅샷 → diff changes. 스냅샷은 불변이지만 임차인 구역 확인·승인된 입주 제보(창 10)는
 * 비교 화면과 같게 반영한다. 정산 계산(lib/settlement.js)은 그대로다.
 */
function changesFor(db, moveInReportId, moveOutReportId) {
  return diffBaseline(
    getSnapshotByReportId(db, moveInReportId),
    getSnapshotByReportId(db, moveOutReportId),
    ITEM_CATALOG,
    diffExtrasFor(db, moveInReportId)
  ).changes;
}

function unitName(db, unitId) {
  return db.prepare('SELECT name FROM units WHERE id = ?').get(unitId)?.name ?? null;
}

/**
 * 정산에 쓰는 계약 (창 12): 입주 리포트 날짜가 기간에 드는 계약(없으면 그 전에 시작한 최근 계약).
 * 호실의 "최근 계약"을 쓰면 새 계약 등록 뒤 옛 정산의 특약·보증금이 바뀐다.
 */
function leaseForSettlement(db, row) {
  const moveInReportDate = getReportRow(db, row.move_in_report_id).created_at.slice(0, 10);
  return { lease: getLeaseForDate(db, row.unit_id, moveInReportDate), moveInReportDate };
}

/**
 * 정산 계산 결과 = 저장된 행 + lib/settlement.js 계산 + 임차인 응답(창 11) + 특약 원문.
 * 합의 확정 때 이 값을 그대로 스냅샷으로 동결한다 (창 15). 최근 링크처럼 확정 뒤에도 바뀌는 값은 넣지 않는다.
 */
export function computeSettlementBody(db, row) {
  const { lease, moveInReportDate } = leaseForSettlement(db, row);
  const moveOut = getReportRow(db, row.move_out_report_id);
  const moveOutDate = moveOut.created_at.slice(0, 10);
  const moveInDate = lease?.startDate ?? moveInReportDate;

  const stored = listSettlementItems(db, row.id);
  const byCode = Object.fromEntries(stored.map((it) => [it.itemCode, it]));
  const changes = changesFor(db, row.move_in_report_id, row.move_out_report_id).filter((ch) => byCode[ch.itemCode]);
  const result = computeSettlement({ changes, lease, items: byCode, moveInDate, moveOutDate });

  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: unitName(db, row.unit_id),
    moveInReportId: row.move_in_report_id,
    moveOutReportId: row.move_out_report_id,
    status: row.status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
    leaseId: lease?.id ?? null,
    moveInDate,
    moveOutDate,
    ...result,
    items: result.items.map((it) => {
      const st = byCode[it.itemCode];
      return {
        ...it,
        basis: it.basis && { ...it.basis, clause: it.basis.clauseNo ? clauseOf(lease, it.basis.clauseNo) : null },
        payerSource: st.payerSource ?? null, // 수선비 장부 사유 판단용 (창 16)
        tenantResponse: st.tenantResponse,
        tenantResponseText: st.tenantResponseText,
        tenantResponseImage: st.tenantResponseImage,
        tenantRespondedAt: st.tenantRespondedAt,
      };
    }),
  };
}

/**
 * 확정된 정산은 동결된 스냅샷을 그대로, 아니면 지금 계산한 값 (창 15).
 * 확정 뒤 견적·특약·diff가 바뀌어도 확정 결과는 바뀌지 않는다. frozen = 스냅샷에서 읽었는가.
 */
function settlementBody(db, row) {
  if (row.status === 'confirmed') {
    const frozen = getSettlementSnapshot(db, row.id);
    if (frozen) return { ...frozen, frozen: true };
  }
  return { ...computeSettlementBody(db, row), frozen: false };
}

/** 정산 응답 = 정산 본문(계산 또는 스냅샷) + 최근 링크(창 11). */
function buildSettlementView(db, row, now = new Date()) {
  return { ...settlementBody(db, row), shareLink: shareLinkView(latestSettlementShareLink(db, row.id), now) };
}

function shareLinkView(link, now) {
  if (!link) return null;
  return {
    token: link.token,
    path: `/share/settlement/${link.token}`,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    expired: isShareExpired(link.expiresAt, now),
    firstViewedAt: link.firstViewedAt,
  };
}

/** 저장된 항목 기준으로 정산 상태(draft/hold)를 다시 맞춘다. 확정은 그대로. */
function syncStatus(db, row) {
  const status = settlementStatus(row.status, listSettlementItems(db, row.id));
  if (status !== row.status) setSettlementStatus(db, row.id, status);
  return getSettlementRow(db, row.id);
}

function clauseOf(lease, clauseNo) {
  const c = lease?.clauses?.find((cl) => cl.clauseNo === clauseNo);
  return c ? { clauseNo: c.clauseNo, title: c.templateTitle ?? null, text: c.text } : null;
}

/**
 * 임차인 링크 화면용 정산 (창 11). 임차인 부담 항목만, 적용 기준에 특약 원문이 붙어 있다.
 * 보류·임대인 부담 항목과 수선비 장부 금액은 보내지 않는다. 확정 뒤에는 스냅샷에서 고른다 (창 15).
 */
function buildShareView(db, row) {
  const full = settlementBody(db, row);
  return {
    id: full.id,
    unitName: full.unitName,
    status: full.status,
    confirmedAt: full.confirmedAt,
    moveInDate: full.moveInDate,
    moveOutDate: full.moveOutDate,
    elapsedMonths: full.elapsedMonths,
    items: full.items
      .filter((it) => it.payer === 'tenant')
      .map((it) => ({
        itemCode: it.itemCode,
        zone: it.zone,
        name: it.name,
        tier: it.tier,
        from: it.from,
        to: it.to,
        evidence: it.evidence,
        lifespanYears: it.lifespanYears,
        estimateCost: it.estimateCost,
        tenantAmount: it.tenantAmount,
        basis: it.basis,
        conditionClauseNo: it.conditionClauseNo ?? null, // 임대인이 확인한 조건부 특약 (창 25, 원문은 basis.clause)
        response: it.tenantResponse
          ? {
              response: it.tenantResponse,
              text: it.tenantResponseText,
              image: it.tenantResponseImage,
              respondedAt: it.tenantRespondedAt,
            }
          : null,
      })),
    fees: full.fees,
    totals: { tenantTotal: full.totals.tenantTotal, deposit: full.totals.deposit, depositReturn: full.totals.depositReturn },
    frozen: full.frozen,
  };
}

/**
 * 분쟁 대비 증빙 패키지 입력 수집 (창 19, 읽기만 한다). 조립은 lib/evidencePackage.js.
 * 확정 정산은 동결 스냅샷 그대로, 계약은 정산 본문의 leaseId(없으면 입주 리포트 날짜 기준).
 * 사진은 리포트 스냅샷(불변)과 승인 제보에서 diff로 고른다.
 */
function buildEvidence(db, row, now) {
  const body = settlementBody(db, row);
  const { frozen, ...settlement } = body;
  const moveInSnapshot = getSnapshotByReportId(db, row.move_in_report_id);
  const moveIn = getReportRow(db, row.move_in_report_id);
  const lease = settlement.leaseId != null ? getLeaseById(db, settlement.leaseId) : leaseForSettlement(db, row).lease;
  const tenantZoneConfirmations = listZoneConfirmations(db, moveIn.inspection_id).filter((c) => c.role === 'tenant');
  // 스냅샷에 이미 있는 임차인 구역 확인과 겹치면 스냅샷 쪽을 쓴다
  const snapTenantZones = new Set(
    (moveInSnapshot?.zoneConfirmations ?? []).filter((c) => c.role === 'tenant').map((c) => c.zone)
  );
  return buildEvidencePackage({
    settlement,
    frozen,
    lease,
    moveInSnapshot,
    moveOutSnapshot: getSnapshotByReportId(db, row.move_out_report_id),
    tenantZoneConfirmations: tenantZoneConfirmations.filter((c) => !snapTenantZones.has(c.zone)),
    tenantReports: listTenantReports(db, row.move_in_report_id),
    changes: diffBaseline(
      moveInSnapshot,
      getSnapshotByReportId(db, row.move_out_report_id),
      ITEM_CATALOG,
      diffExtrasFor(db, row.move_in_report_id)
    ).changes,
    zones: ZONES,
    link: latestSettlementShareLink(db, row.id),
    integrity: {
      moveIn: verifyReportSnapshot(db, row.move_in_report_id),
      moveOut: verifyReportSnapshot(db, row.move_out_report_id),
      settlement: verifySettlementSnapshot(db, row.id),
    },
    now,
  });
}

/** 정산 로드 + 권한 (조회: 그 호실 owner/tenant, 수정: owner만). */
function loadSettlement(db, id, user, { write = false } = {}) {
  const row = getSettlementRow(db, Number(id));
  if (!row) throw errors.notFound('정산을 찾을 수 없습니다.');
  if (!isUnitParty(db, row.unit_id, user)) throw errors.forbidden('이 호실의 정산을 볼 권한이 없습니다.');
  if (write) {
    if (user.role !== 'owner') throw errors.forbidden('정산은 임대인만 수정할 수 있습니다.');
    if (row.status === 'confirmed') throw errors.badRequest('확정된 정산은 수정할 수 없습니다.', 'SETTLEMENT_CONFIRMED');
  }
  return row;
}

export function createSettlementsRouter(db, { now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());
  const view = (row) => buildSettlementView(db, row, clock());
  router.use(requireUser);

  // 정산 생성 (임대인만). 같은 리포트 쌍의 정산이 이미 있으면 그것을 돌려준다(200)
  router.post('/', (req, res) => {
    requireFields(req.body, ['moveInReportId', 'moveOutReportId']);
    const moveIn = getReportRow(db, Number(req.body.moveInReportId));
    const moveOut = getReportRow(db, Number(req.body.moveOutReportId));
    if (!moveIn || !moveOut) throw errors.notFound('리포트를 찾을 수 없습니다.');

    if (req.user.role !== 'owner' || !isUnitParty(db, moveIn.unit_id, req.user)) {
      throw errors.forbidden('정산은 그 호실의 임대인만 만들 수 있습니다.');
    }
    if (moveIn.unit_id !== moveOut.unit_id) {
      throw errors.badRequest('같은 호실의 리포트만 정산할 수 있습니다.', 'UNIT_MISMATCH');
    }
    if (moveIn.type !== 'move_in' || !MOVE_OUT_TYPES.includes(moveOut.type)) {
      throw errors.badRequest('입주 전 리포트와 퇴거 전/후 리포트로만 정산할 수 있습니다.', 'TYPE_MISMATCH');
    }

    const existing = findSettlementByPair(db, moveIn.id, moveOut.id);
    if (existing) return res.ok({ settlement: view(existing) });

    const items = changesFor(db, moveIn.id, moveOut.id).map((ch) => ({ itemCode: ch.itemCode, payer: defaultPayer(ch) }));
    const id = createSettlement(db, {
      unitId: moveIn.unit_id,
      moveInReportId: moveIn.id,
      moveOutReportId: moveOut.id,
      items,
    });
    res.ok({ settlement: view(getSettlementRow(db, id)) }, 201);
  });

  // 정산 조회 (계산 결과 포함). 그 호실 owner/tenant
  router.get('/:id', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user);
    res.ok({ settlement: view(row) });
  });

  // 항목 부담자·견적·조건부 특약 확인 수정 (임대인만). 임차인이 응답한 항목은 "임대인 부담으로 돌리기"만 (창 11)
  router.patch('/:id/items/:itemCode', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user, { write: true });
    const body = req.body ?? {};
    const patch = {};
    if ('payer' in body) {
      if (!PAYERS.includes(body.payer)) throw errors.badRequest('부담자는 tenant, landlord, hold 중 하나입니다.', 'INVALID_PAYER');
      patch.payer = body.payer;
    }
    if ('estimateCost' in body) {
      const c = body.estimateCost;
      if (c !== null && !(Number.isInteger(c) && c >= 0)) {
        throw errors.badRequest('견적 금액은 0 이상의 정수(원)여야 합니다.', 'INVALID_COST');
      }
      patch.estimateCost = c;
    }
    const current = listSettlementItems(db, row.id).find((it) => it.itemCode === req.params.itemCode);
    if (!current) throw errors.notFound('정산 항목을 찾을 수 없습니다.');
    // 조건부 특약 "조건 해당" 확인 (창 25). 원인 판단은 임대인이 하고, 그 항목의 조건부 특약 번호만 받는다
    if ('conditionClauseNo' in body) {
      const no = body.conditionClauseNo;
      if (no !== null) {
        const allowed = conditionalClausesFor(leaseForSettlement(db, row).lease?.clauses, getItem(current.itemCode)?.name);
        if (!allowed.some((c) => c.clauseNo === no)) {
          throw errors.badRequest('이 항목에 적용할 수 있는 조건부 특약이 아닙니다.', 'INVALID_CONDITION_CLAUSE');
        }
      }
      patch.conditionClauseNo = no;
    }
    assertEditableAfterResponse(current, patch);
    if ('payer' in patch && patch.payer !== current.payer) patch.payerSource = 'manual';
    updateSettlementItem(db, row.id, req.params.itemCode, patch);
    res.ok({ settlement: view(syncStatus(db, row)) });
  });

  // 소액 일괄 처리: 견적이 기준 이하인 항목 → 임대인 부담 (임대인만)
  router.post('/:id/bulk-small', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user, { write: true });
    const threshold = req.body?.threshold ?? SMALL_BULK_THRESHOLD;
    if (!(Number.isInteger(threshold) && threshold >= 0)) {
      throw errors.badRequest('기준 금액은 0 이상의 정수(원)여야 합니다.', 'INVALID_THRESHOLD');
    }
    const before = listSettlementItems(db, row.id);
    const after = applySmallBulk(before, threshold);
    const changedItemCodes = after.filter((it, i) => it.payer !== before[i].payer).map((it) => it.itemCode);
    db.transaction(() => {
      for (const code of changedItemCodes) updateSettlementItem(db, row.id, code, { payer: 'landlord', payerSource: 'bulk_small' });
    })();
    res.ok({ settlement: view(syncStatus(db, row)), changedItemCodes, threshold });
  });

  // 임차인 응답 링크 만들기 (임대인만, 7일 뒤 만료). 실제 발송은 하지 않고 모의 알림 문구만 돌려준다
  router.post('/:id/share', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user, { write: true });
    const at = clock();
    const link = createSettlementShareLink(db, {
      settlementId: row.id,
      token: randomUUID(),
      createdBy: req.user.id,
      createdAt: at.toISOString(),
      expiresAt: shareExpiresAt(at),
    });
    const path = `/share/settlement/${link.token}`;
    res.ok(
      {
        token: link.token,
        path,
        expiresAt: link.expiresAt,
        message: shareMessage({ unitName: unitName(db, row.unit_id), path, expiresAt: link.expiresAt }),
        sent: false,
        settlement: view(row),
      },
      201
    );
  });

  // 합의 확정 (임대인만). 이의가 있으면(hold) 400. 모든 임차인 부담 항목이 동의일 때만 확정.
  // 같은 트랜잭션에서 확정 시점 계산 결과를 스냅샷 + SHA-256으로 동결한다 (창 15)
  router.post('/:id/confirm', (req, res) => {
    const row = syncStatus(db, loadSettlement(db, req.params.id, req.user, { write: true }));
    const check = confirmCheck(listSettlementItems(db, row.id));
    if (!check.ok) throw errors.badRequest(check.message, check.code);
    db.transaction(() => {
      confirmSettlement(db, row.id, clock().toISOString());
      insertSettlementSnapshot(db, row.id, computeSettlementBody(db, getSettlementRow(db, row.id)));
    })();
    res.ok({ settlement: view(getSettlementRow(db, row.id)) });
  });

  // 분쟁 대비 증빙 패키지 (창 19). 그 호실 owner만. 확정 전(draft·hold)·확정 뒤 모두, 확정 뒤는 스냅샷 기준
  router.get('/:id/evidence', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user);
    if (req.user.role !== 'owner') throw errors.forbidden('증빙 자료는 임대인만 만들 수 있습니다.');
    res.ok({ evidence: buildEvidence(db, row, clock()) });
  });

  // 확정 정산서 해시 검증 (창 15). 그 호실 owner/tenant. 확정 전이면 400
  router.get('/:id/verify', (req, res) => {
    const row = loadSettlement(db, req.params.id, req.user);
    const verify = verifySettlementSnapshot(db, row.id);
    if (!verify) throw errors.badRequest('합의 확정된 정산만 검증할 수 있습니다.', 'SETTLEMENT_NOT_CONFIRMED');
    res.ok(verify);
  });

  return router;
}

/**
 * 임차인 정산 링크 (창 11, 비인증 — 토큰이 곧 권한). 조회와 항목별 동의/이의 한 번씩만 가능.
 * 부담자·견적 수정, 응답 수정·삭제 경로는 없다.
 */
export function createSettlementShareRouter(db, { now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());

  function loadLink(token, at) {
    const link = getSettlementShareLink(db, token);
    assertShareLinkUsable(link, at);
    return link;
  }

  router.get('/:token', (req, res) => {
    const at = clock();
    const link = loadLink(req.params.token, at);
    markShareLinkViewed(db, link.id, at.toISOString());
    const viewed = getSettlementShareLink(db, link.token);
    res.ok({
      settlement: buildShareView(db, getSettlementRow(db, link.settlementId)),
      link: { expiresAt: viewed.expiresAt, firstViewedAt: viewed.firstViewedAt },
      verify: verifySettlementSnapshot(db, link.settlementId), // 확정 전이면 null (창 15)
    });
  });

  router.post('/:token/respond', (req, res) => {
    const at = clock();
    const link = loadLink(req.params.token, at);
    const row = getSettlementRow(db, link.settlementId);
    if (row.status === 'confirmed') throw errors.badRequest('확정된 정산에는 응답할 수 없습니다.', 'SETTLEMENT_CONFIRMED');

    const input = normalizeTenantResponse(req.body);
    const item = listSettlementItems(db, row.id).find((it) => it.itemCode === input.itemCode);
    if (!item) throw errors.notFound('정산 항목을 찾을 수 없습니다.');
    if (item.payer !== 'tenant') throw errors.badRequest('임차인 부담 항목에만 응답할 수 있습니다.', 'NOT_CHARGED');
    if (item.tenantResponse) throw errors.badRequest('이미 응답한 항목입니다. 응답은 수정할 수 없습니다.', 'ALREADY_RESPONDED');

    recordTenantResponse(db, row.id, input.itemCode, { ...input, respondedAt: at.toISOString() });
    markShareLinkViewed(db, link.id, at.toISOString());
    res.ok({ settlement: buildShareView(db, syncStatus(db, row)) });
  });

  return router;
}
