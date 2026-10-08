import { errors } from './errors.js';

/**
 * 수리 전·수리 후 점검 사진 게이트 (창 26, 순수 함수, AI 사용 안 함).
 * 기획서 "시공 전/중/후 사진 100% 기록": 수리 전·수리 후 점검은 문제 항목이 1개 이상이고
 * 항목마다 그 항목에 연결된 사진(이미지 item_id = 저장 시 itemIndex)이 1장 이상이어야 제출된다.
 * 긴급(emergency)·정기·baseline은 이 규칙을 쓰지 않는다(기존 규칙 그대로).
 */

export const REPAIR_TYPES = ['repair_pre', 'repair_post'];

export const isRepairType = (type) => REPAIR_TYPES.includes(type);

/** 사진이 없는 항목 → [{ index(1부터), label }] */
export function itemsWithoutPhoto({ items = [], images = [] }) {
  const withPhoto = new Set(images.filter((img) => img.item_id != null).map((img) => img.item_id));
  return items
    .map((it, i) => ({ it, index: i + 1 }))
    .filter(({ it }) => !withPhoto.has(it.id))
    .map(({ it, index }) => ({ index, label: [it.category, it.name].filter(Boolean).join(' ') || null }));
}

/**
 * 제출 직전 검증. 수리 전·후가 아니면 아무것도 하지 않는다.
 * @param {{ type, items, images }} inspection  getInspectionById 결과
 * @throws AppError 400 PHOTO_REQUIRED_REPAIR
 */
export function validateRepairSubmission(inspection) {
  if (!isRepairType(inspection.type)) return;
  const items = inspection.items ?? [];
  if (items.length === 0) {
    throw errors.badRequest('수리 전·수리 후 점검은 문제 항목을 1개 이상 기록해야 합니다.', 'PHOTO_REQUIRED_REPAIR');
  }
  const missing = itemsWithoutPhoto({ items, images: inspection.images ?? [] });
  if (missing.length > 0) {
    const where = missing.map((m) => `문제 항목 ${m.index}${m.label ? `(${m.label})` : ''}`).join(', ');
    throw errors.badRequest(
      `수리 전·수리 후 점검은 항목마다 사진이 1장 이상 필요합니다. 사진이 없는 항목: ${where}`,
      'PHOTO_REQUIRED_REPAIR'
    );
  }
}

/**
 * 수리 후 점검 ↔ 수리 전 리포트 연결 검증. 수리 후 점검만, 같은 호실의 수리 전 리포트만.
 * @param {{ type, unit_id }} inspection
 * @param {{ type, unit_id } | undefined} preReport
 * @throws AppError 400 INVALID_REPAIR_LINK
 */
export function assertRepairLink(inspection, preReport) {
  if (inspection.type !== 'repair_post') {
    throw errors.badRequest('수리 전 리포트는 수리 후 점검에서만 연결할 수 있습니다.', 'INVALID_REPAIR_LINK');
  }
  if (!preReport || preReport.unit_id !== inspection.unit_id || preReport.type !== 'repair_pre') {
    throw errors.badRequest('같은 호실의 수리 전 리포트만 연결할 수 있습니다.', 'INVALID_REPAIR_LINK');
  }
}

/** PATCH 본문의 repairPreReportId 정리. null이면 연결 해제. 숫자가 아니면 400 INVALID_REPAIR_LINK. */
export function normalizeRepairLinkInput(value) {
  if (value === null) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw errors.badRequest('수리 전 리포트 번호가 올바르지 않습니다.', 'INVALID_REPAIR_LINK');
  }
  return id;
}
