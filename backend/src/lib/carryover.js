import { getItem, ITEM_CATALOG } from '../domain/itemCatalog.js';
import { errors } from './errors.js';

/**
 * 다음 입주 기준선 가져오기 (창 20, 순수 함수, AI 사용 안 함).
 * 설계 원칙 "퇴거 리포트가 다음 입주의 기준선이 된다": 가장 최근 퇴거 리포트의 이상 항목을
 * 다음 입주 전 점검의 제안 상태로 만든다. 판단(공제·책임)은 하지 않는다.
 *
 * - 확정된 정산에 들어간 항목(임차인·임대인 부담 모두 — 공제·장부로 수리비가 처리됨) → 제안 'normal' + "수리 확인 필요"
 * - 정산에 없거나 정산이 확정 전 → 퇴거 상태 그대로 "이전 퇴거 상태 이어받음"
 */

export const REASON_REPAIR_CHECK = '퇴거 정산 항목 · 수리 확인 필요';
export const REASON_INHERIT = '이전 퇴거 상태 이어받음';
export const MOVE_OUT_TYPES = ['move_out_pre', 'move_out_post'];

/**
 * @param {object} input
 * @param {{ id, created_at }} input.sourceReport     퇴거 리포트 행
 * @param {object} input.moveOutSnapshot              그 리포트의 불변 스냅샷
 * @param {{ status, items: Array<{ itemCode, payer }> } | null} input.settlement
 *   그 퇴거 리포트의 정산(확정이면 동결 스냅샷의 항목, 아니면 저장된 항목). 없으면 null.
 * @returns {{ sourceReportId, sourceDate, settlementId, items: Array }}
 */
export function buildCarryover({ sourceReport, moveOutSnapshot, settlement = null }) {
  const confirmed = settlement?.status === 'confirmed';
  const settlementByCode = new Map((settlement?.items ?? []).map((it) => [it.itemCode, it]));
  const images = moveOutSnapshot?.images ?? [];

  const items = (moveOutSnapshot?.items ?? [])
    .filter((it) => it.item_code && getItem(it.item_code) && it.state && it.state !== 'normal')
    .map((it) => {
      const entry = getItem(it.item_code);
      const inSettlement = settlementByCode.has(it.item_code);
      const repairCheck = inSettlement && confirmed;
      return {
        itemCode: entry.code,
        zone: entry.zone,
        name: entry.name,
        tier: entry.tier,
        state: it.state,
        description: it.description ?? null,
        inSettlement,
        settlementStatus: inSettlement ? settlement.status : null,
        payer: inSettlement ? settlementByCode.get(it.item_code).payer ?? null : null,
        suggestedState: repairCheck ? 'normal' : it.state,
        needsRepairCheck: repairCheck,
        reason: repairCheck ? REASON_REPAIR_CHECK : REASON_INHERIT,
        // 폼의 작은 미리보기용 퇴거 항목 사진 (스냅샷 그대로)
        moveOutImages: images
          .filter((img) => img.item_id != null && img.item_id === it.id)
          .map((img) => ({ caption: img.caption ?? null, data_base64: img.data_base64 })),
      };
    });

  const order = new Map(ITEM_CATALOG.map((it, i) => [it.code, i])); // 카탈로그 순서
  items.sort((a, b) => order.get(a.itemCode) - order.get(b.itemCode));

  return {
    sourceReportId: sourceReport.id,
    sourceDate: String(sourceReport.created_at ?? '').slice(0, 10),
    settlementId: settlement?.id ?? null,
    items,
  };
}

/** 퇴거 리포트 목록(발행 순) 중 가장 최근 것. 없으면 null. */
export function latestMoveOutReport(reports = []) {
  const moveOuts = reports.filter((r) => MOVE_OUT_TYPES.includes(r.type));
  moveOuts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  return moveOuts[0] ?? null;
}

/**
 * PATCH /api/inspections/:id 의 carryover 본문 정리. null이면 지운다.
 * → { sourceReportId, items: [{ itemCode, reason, repairCheckPending }] } (카탈로그 코드만, 중복 제거)
 * 형식이 틀리면 AppError(400 INVALID_CARRYOVER).
 */
export function normalizeCarryoverInput(input) {
  if (input === null) return null;
  const bad = (msg) => errors.badRequest(msg, 'INVALID_CARRYOVER');
  if (typeof input !== 'object' || Array.isArray(input)) throw bad('carryover 형식이 올바르지 않습니다.');
  const sourceReportId = Number(input.sourceReportId);
  if (!Number.isInteger(sourceReportId) || sourceReportId <= 0) throw bad('이전 퇴거 리포트 번호가 필요합니다.');
  if (!Array.isArray(input.items)) throw bad('carryover.items는 배열이어야 합니다.');

  const seen = new Set();
  const items = [];
  for (const it of input.items) {
    const entry = getItem(it?.itemCode);
    if (!entry) throw bad(`알 수 없는 항목 코드입니다: ${it?.itemCode ?? '(없음)'}`);
    if (seen.has(entry.code)) continue;
    seen.add(entry.code);
    items.push({
      itemCode: entry.code,
      reason: String(it.reason ?? REASON_INHERIT).slice(0, 100),
      repairCheckPending: !!it.repairCheckPending,
    });
  }
  return { sourceReportId, items };
}

/**
 * carryover를 저장해도 되는 점검·원본인가. 입주 전 점검만, 같은 호실의 퇴거 리포트만.
 * @param {{ type, unit_id }} inspection
 * @param {{ type, unit_id } | undefined} sourceReport
 */
export function assertCarryoverTarget(inspection, sourceReport) {
  if (inspection.type !== 'move_in') {
    throw errors.badRequest('이전 퇴거 기록은 입주 전 점검에서만 가져올 수 있습니다.', 'CARRYOVER_NOT_MOVE_IN');
  }
  if (!sourceReport || sourceReport.unit_id !== inspection.unit_id || !MOVE_OUT_TYPES.includes(sourceReport.type)) {
    throw errors.badRequest('같은 호실의 퇴거 리포트만 가져올 수 있습니다.', 'INVALID_CARRYOVER');
  }
}
