import { errors, AppError } from './errors.js';
import { validateImageSize } from './validation.js';

/**
 * 공유 링크 만료 + 임차인 링크 응답 → 정산 보류 (창 11, 순수 로직). AI 사용 안 함.
 * - 공유 링크(리포트·정산)는 만든 때부터 7일 뒤 만료된다.
 * - 임차인은 로그인 없이 링크로 임차인 부담 항목마다 동의(agree) / 이의(object)를 한 번만 남긴다(수정·삭제 없음).
 * - 임차인 부담 항목에 이의가 하나라도 있으면 정산 상태는 'hold'. 모든 임차인 부담 항목이 agree일 때만 확정 가능.
 */

export const SHARE_LINK_DAYS = 7;
export const TENANT_RESPONSES = ['agree', 'object'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 만료 시각 (ISO). */
export function shareExpiresAt(now, days = SHARE_LINK_DAYS) {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** 만료 시각이 지났는가 (만료 시각 정각부터 만료). 만료 시각이 없으면(옛 행) 만료로 본다. */
export function isShareExpired(expiresAt, now) {
  if (!expiresAt) return true;
  return now.getTime() >= new Date(expiresAt).getTime();
}

/** 링크가 없으면 404, 만료면 410. */
export function assertShareLinkUsable(link, now) {
  if (!link) throw errors.notFound('공유 링크를 찾을 수 없습니다.');
  if (isShareExpired(link.expiresAt, now)) {
    throw new AppError('SHARE_LINK_EXPIRED', '공유 링크가 만료되었습니다. 새 링크를 요청하세요.', 410);
  }
}

/**
 * 링크 응답 검증·정리. 잘못되면 AppError(400).
 * 이의는 내용(text)이 필수, 사진(image)은 선택. 동의는 text만 선택.
 * @returns {{ itemCode, response, text, image }}
 */
export function normalizeTenantResponse(body) {
  const itemCode = typeof body?.itemCode === 'string' ? body.itemCode : '';
  if (!itemCode) throw errors.badRequest('항목 코드가 필요합니다.', 'VALIDATION');
  const response = body?.response;
  if (!TENANT_RESPONSES.includes(response)) {
    throw errors.badRequest('응답은 agree(동의) 또는 object(이의)입니다.', 'INVALID_RESPONSE');
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (response === 'object' && !text) throw errors.badRequest('이의 내용을 입력하세요.', 'VALIDATION');
  const image = response === 'object' ? body?.image || null : null;
  if (image) validateImageSize(image);
  return { itemCode, response, text: text || null, image };
}

/** 임차인 청구 항목 = 부담자가 임차인인 항목. */
export function chargedItems(items) {
  return items.filter((it) => it.payer === 'tenant');
}

/**
 * 저장할 정산 상태. confirmed는 그대로, 아니면 임차인 부담 항목에 이의가 있으면 hold, 없으면 draft.
 * 이의 항목을 임대인 부담으로 돌리면 그 이의는 더 이상 청구 항목이 아니라 보류가 풀린다(응답 기록은 남는다).
 * @param {string} current 지금 상태
 * @param {Array<{payer, tenantResponse}>} items
 */
export function settlementStatus(current, items) {
  if (current === 'confirmed') return 'confirmed';
  return chargedItems(items).some((it) => it.tenantResponse === 'object') ? 'hold' : 'draft';
}

/**
 * 합의 확정 가능 여부. 막히면 { ok:false, code, message }.
 * - 이의 있음(hold) → SETTLEMENT_ON_HOLD
 * - 부담자 '보류' 항목이 남음 → ITEMS_ON_HOLD
 * - 임차인 부담 항목 중 동의하지 않은(무응답) 항목 → NOT_ALL_AGREED
 */
export function confirmCheck(items) {
  const charged = chargedItems(items);
  if (charged.some((it) => it.tenantResponse === 'object')) {
    return { ok: false, code: 'SETTLEMENT_ON_HOLD', message: '임차인 이의가 있어 정산이 보류 중입니다.' };
  }
  if (items.some((it) => it.payer === 'hold')) {
    return { ok: false, code: 'ITEMS_ON_HOLD', message: '부담자가 정해지지 않은(보류) 항목이 있습니다.' };
  }
  const waiting = charged.filter((it) => it.tenantResponse !== 'agree').map((it) => it.itemCode);
  if (waiting.length) {
    return { ok: false, code: 'NOT_ALL_AGREED', message: '임차인이 아직 동의하지 않은 청구 항목이 있습니다.', itemCodes: waiting };
  }
  return { ok: true };
}

/**
 * 임차인이 응답한 항목에 허용되는 임대인 수정: 부담자를 임대인으로 돌리는 것만.
 * (응답한 금액·부담자가 바뀌면 응답이 뜻을 잃는다.)
 */
export function assertEditableAfterResponse(item, patch) {
  if (!item?.tenantResponse) return;
  const onlyToLandlord = Object.keys(patch).length === 1 && patch.payer === 'landlord';
  if (!onlyToLandlord) {
    throw errors.badRequest('임차인이 응답한 항목은 임대인 부담으로 돌리기만 할 수 있습니다.', 'ITEM_RESPONDED');
  }
}

/** 모의 알림 문구 (실제 발송 없음). */
export function shareMessage({ unitName, path, expiresAt }) {
  const title = unitName ? `${unitName} 보증금 정산서` : '보증금 정산서';
  return `[버틀러] ${title}가 도착했습니다. 항목별로 동의 또는 이의를 남겨 주세요. ${path} (${expiresAt.slice(0, 10)}까지)`;
}
