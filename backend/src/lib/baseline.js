import { ZONES, getItem } from '../domain/itemCatalog.js';
import { errors } from './errors.js';

/**
 * 입주·퇴거 기준선(baseline) 점검 순수 로직.
 * - 상태는 정상/경미/손상/파손 4단계, 기본값 정상.
 * - 이상 항목(정상이 아닌 항목)만 저장한다.
 * - 구역 단위 "이상 없음" 확인은 zonesConfirmed로 받는다.
 */

export const BASELINE_STATES = ['normal', 'minor', 'damaged', 'broken'];

/**
 * 생성/수정 본문의 items·images·observations를 기준선 저장 형태로 바꾼다.
 * - items: itemCode 필수(카탈로그 코드), state는 4단계(없으면 normal). normal은 버린다.
 *   category/name은 카탈로그의 zone/name으로 채운다.
 * - images·observations의 itemIndex는 걸러진 items 기준으로 다시 맞춘다.
 *   images는 itemIndex 대신 itemCode로도 항목을 가리킬 수 있다. items 없이 사진만 보내면
 *   existingItems(저장된 항목, id 순)에서 코드를 찾는다.
 *   정상이라 버려진 항목을 가리키던 사진은 항목 연결 없이(item_id NULL) 남는다.
 * 잘못된 코드/상태/구역이면 AppError(400).
 */
export function normalizeBaselineInput({ items, images, observations } = {}, existingItems = []) {
  const out = {};
  const indexMap = new Map(); // 원래 itemIndex → 새 itemIndex
  const codeIndex = new Map(); // itemCode → 새 itemIndex
  if (items === undefined) existingItems.forEach((it, i) => it.item_code && codeIndex.set(it.item_code, i));

  if (items !== undefined) {
    const kept = [];
    const seen = new Set();
    (items ?? []).forEach((it, i) => {
      const entry = getItem(it?.itemCode);
      if (!entry) {
        throw errors.badRequest(`알 수 없는 항목 코드입니다: ${it?.itemCode ?? '(없음)'}`, 'INVALID_ITEM_CODE');
      }
      if (seen.has(entry.code)) {
        throw errors.badRequest(`같은 항목이 두 번 들어왔습니다: ${entry.zone} ${entry.name}`, 'DUPLICATE_ITEM_CODE');
      }
      seen.add(entry.code);
      const state = it.state ?? 'normal';
      if (!BASELINE_STATES.includes(state)) {
        throw errors.badRequest(`항목 상태는 정상/경미/손상/파손 중 하나여야 합니다: ${state}`, 'INVALID_STATE');
      }
      if (state === 'normal') return;
      indexMap.set(i, kept.length);
      codeIndex.set(entry.code, kept.length);
      kept.push({
        itemCode: entry.code,
        category: entry.zone,
        name: entry.name,
        state,
        location: it.location ?? null,
        description: it.description ?? null,
      });
    });
    out.items = kept;
  }

  // items가 안 들어왔으면 인덱스를 바꾸지 않는다(기존 항목 기준 그대로).
  const remap = (idx) => (items === undefined ? idx : idx == null ? null : indexMap.get(idx) ?? null);

  if (images !== undefined) {
    out.images = (images ?? []).map((img) => {
      const { itemCode, ...rest } = img ?? {};
      const itemIndex = itemCode != null ? codeIndex.get(itemCode) ?? null : remap(img?.itemIndex);
      if (rest.zone != null && !ZONES.includes(rest.zone)) {
        throw errors.badRequest(`알 수 없는 구역입니다: ${rest.zone}`, 'INVALID_ZONE');
      }
      return { ...rest, itemIndex };
    });
  }

  if (observations !== undefined) {
    out.observations = (observations ?? []).map((o) => ({ ...o, itemIndex: remap(o.itemIndex) }));
  }

  return out;
}

/** zonesConfirmed 검증. 중복은 합치고, 모르는 구역이면 AppError(400). */
export function normalizeZones(zones = []) {
  if (!Array.isArray(zones)) throw errors.badRequest('zonesConfirmed는 배열이어야 합니다.', 'VALIDATION');
  for (const z of zones) {
    if (!ZONES.includes(z)) throw errors.badRequest(`알 수 없는 구역입니다: ${z}`, 'INVALID_ZONE');
  }
  return ZONES.filter((z) => zones.includes(z));
}

/**
 * 제출 전 검증 (baseline만). 위반 시 AppError(400).
 * 1) 7개 구역 각각이 "이상 없음" 확인됐거나 그 구역에 이상 항목이 1개 이상 있어야 한다.
 * 2) 핵심(core) 항목이 정상이 아니면 그 항목에 연결된 사진이 1장 이상 있어야 한다.
 *
 * @param {{items:Array, images:Array, zoneConfirmations:Array}} inspection  getInspectionById 결과
 */
export function validateBaselineSubmission({ items = [], images = [], zoneConfirmations = [] }) {
  const confirmed = new Set(zoneConfirmations.map((z) => z.zone));
  const abnormalZones = new Set(items.filter((it) => it.state !== 'normal').map((it) => it.category));
  const missing = ZONES.filter((z) => !confirmed.has(z) && !abnormalZones.has(z));
  if (missing.length > 0) {
    throw errors.badRequest(
      `확인하지 않은 구역이 있습니다: ${missing.join(', ')}. 구역마다 "이상 없음"을 확인하거나 이상 항목을 기록하세요.`,
      'ZONES_NOT_CONFIRMED'
    );
  }

  const photoCount = new Map();
  for (const img of images) {
    if (img.item_id != null) photoCount.set(img.item_id, (photoCount.get(img.item_id) ?? 0) + 1);
  }
  const needPhoto = items.filter(
    (it) => it.state !== 'normal' && getItem(it.item_code)?.tier === 'core' && !photoCount.get(it.id)
  );
  if (needPhoto.length > 0) {
    const names = needPhoto.map((it) => `${it.category} ${it.name}`).join(', ');
    throw errors.badRequest(`핵심 항목에 이상이 있으면 사진이 필요합니다: ${names}`, 'PHOTO_REQUIRED');
  }
}
