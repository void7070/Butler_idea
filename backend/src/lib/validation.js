import { IMAGE_LIMITS } from '../config.js';
import { errors } from './errors.js';

/**
 * Base64 문자열의 실제 바이트 수를 계산한다.
 * data URL 접두어("data:image/png;base64,...")가 있으면 제거하고 계산한다.
 */
export function base64Bytes(base64) {
  if (typeof base64 !== 'string' || base64.length === 0) return 0;
  const data = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/**
 * 이미지 1장 크기 검증. 초과 시 AppError(IMAGE_TOO_LARGE, 400) throw.
 * @returns {number} 계산된 바이트 수
 */
export function validateImageSize(base64) {
  const bytes = base64Bytes(base64);
  if (bytes > IMAGE_LIMITS.maxBytesPerImage) {
    const mb = IMAGE_LIMITS.maxBytesPerImage / 1024 / 1024;
    throw errors.badRequest(`이미지 1장은 ${mb}MB를 넘을 수 없습니다.`, 'IMAGE_TOO_LARGE');
  }
  return bytes;
}

/**
 * 장수 제한 검증. 항목당 5장, 리포트당 20장 초과 시 AppError(400) throw.
 */
export function validateImageCounts({ perItem = 0, perReport = 0 } = {}) {
  if (perItem > IMAGE_LIMITS.maxPerItem) {
    throw errors.badRequest(
      `점검 항목당 이미지는 최대 ${IMAGE_LIMITS.maxPerItem}장입니다.`,
      'IMAGE_ITEM_LIMIT'
    );
  }
  if (perReport > IMAGE_LIMITS.maxPerReport) {
    throw errors.badRequest(
      `리포트 전체 이미지는 최대 ${IMAGE_LIMITS.maxPerReport}장입니다.`,
      'IMAGE_REPORT_LIMIT'
    );
  }
}

/**
 * 필수 필드 검증. 누락 시 AppError(VALIDATION, 400) throw.
 * @param {object} obj   검사 대상
 * @param {string[]} fields 필수 키 목록
 */
export function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null || obj?.[f] === '');
  if (missing.length > 0) {
    throw errors.badRequest(`필수 항목이 누락되었습니다: ${missing.join(', ')}`, 'VALIDATION');
  }
}

/**
 * 이미지 배치 전체 검증 (저장 전에 호출).
 * - 각 이미지 ≤ 10MB
 * - itemIndex가 같은 이미지 ≤ 5장
 * - 전체 ≤ 20장
 * @param {Array<{dataBase64?: string, itemIndex?: number}>} images
 */
export function validateImageBatch(images = []) {
  for (const img of images) validateImageSize(img?.dataBase64 ?? '');

  const perItem = {};
  for (const img of images) {
    if (img?.itemIndex != null) perItem[img.itemIndex] = (perItem[img.itemIndex] ?? 0) + 1;
  }
  for (const idx of Object.keys(perItem)) validateImageCounts({ perItem: perItem[idx] });

  validateImageCounts({ perReport: images.length });
}
