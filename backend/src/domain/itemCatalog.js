/**
 * 항목 코드 카탈로그. 입주·퇴거 점검이 같은 코드 체계를 쓴다 (progress.md 새 설계 규칙).
 * 7개 구역, 40개 항목(핵심 25 · 일반 15).
 *
 * - tier: 'core'(핵심 — 분쟁이 잦고 비용이 큼, 이상 시 사진 필수) | 'general'(일반 — 체크만, 사진 선택)
 * - 내구연수는 여기 두지 않는다 → domain/lifespans.js (항목 이름별)
 */

export const ZONES = ['현관', '거실', '주방', '화장실', '방1', '방2', '베란다'];

const item = (code, zone, name, tier) => ({ code, zone, name, tier });

export const ITEM_CATALOG = [
  // 현관
  item('ENTRANCE_DOOR', '현관', '현관문', 'core'),
  item('ENTRANCE_SHOE_CABINET', '현관', '신발장', 'core'),
  item('ENTRANCE_FLOOR', '현관', '바닥', 'core'),
  item('ENTRANCE_DOORLOCK', '현관', '도어락', 'general'),
  item('ENTRANCE_SENSOR_LIGHT', '현관', '센서등', 'general'),
  // 거실
  item('LIVING_WALLPAPER', '거실', '벽지', 'core'),
  item('LIVING_FLOORING', '거실', '바닥재', 'core'),
  item('LIVING_WINDOW', '거실', '창호', 'core'),
  item('LIVING_LIGHT', '거실', '조명', 'general'),
  item('LIVING_OUTLET', '거실', '콘센트', 'general'),
  item('LIVING_INTERCOM', '거실', '인터폰', 'general'),
  // 주방
  item('KITCHEN_COUNTERTOP', '주방', '싱크대 상판', 'core'),
  item('KITCHEN_CABINET_DOOR', '주방', '싱크대 문짝', 'core'),
  item('KITCHEN_WALL_TILE', '주방', '벽 타일', 'core'),
  item('KITCHEN_FAUCET', '주방', '수전', 'general'),
  item('KITCHEN_HOOD_FILTER', '주방', '후드 필터', 'general'),
  item('KITCHEN_INDUCTION', '주방', '인덕션', 'general'),
  // 화장실
  item('BATHROOM_SILICONE', '화장실', '실리콘', 'core'),
  item('BATHROOM_TILE', '화장실', '타일', 'core'),
  item('BATHROOM_WASHBASIN', '화장실', '세면대', 'core'),
  item('BATHROOM_TOILET', '화장실', '변기', 'core'),
  item('BATHROOM_FAUCET', '화장실', '수전', 'general'),
  item('BATHROOM_FAN', '화장실', '환풍기', 'general'),
  // 방1
  item('ROOM1_WALLPAPER', '방1', '벽지', 'core'),
  item('ROOM1_FLOORING', '방1', '바닥재', 'core'),
  item('ROOM1_DOOR', '방1', '문·문틀', 'core'),
  item('ROOM1_WINDOW', '방1', '창호', 'core'),
  item('ROOM1_BUILTIN_CLOSET', '방1', '붙박이장', 'core'),
  item('ROOM1_OUTLET', '방1', '콘센트', 'general'),
  item('ROOM1_LIGHT', '방1', '조명', 'general'),
  // 방2
  item('ROOM2_WALLPAPER', '방2', '벽지', 'core'),
  item('ROOM2_FLOORING', '방2', '바닥재', 'core'),
  item('ROOM2_DOOR', '방2', '문·문틀', 'core'),
  item('ROOM2_WINDOW', '방2', '창호', 'core'),
  item('ROOM2_LIGHT', '방2', '조명', 'general'),
  // 베란다
  item('BALCONY_SCREEN', '베란다', '방충망', 'core'),
  item('BALCONY_WINDOW', '베란다', '창호', 'core'),
  item('BALCONY_FLOOR_TILE', '베란다', '바닥 타일', 'core'),
  item('BALCONY_DRAIN', '베란다', '배수구', 'general'),
  item('BALCONY_FAUCET', '베란다', '수전', 'general'),
];

const BY_CODE = new Map(ITEM_CATALOG.map((it) => [it.code, it]));

/** 코드로 항목을 찾는다. 없으면 null. */
export function getItem(code) {
  return BY_CODE.get(code) ?? null;
}

/** ZONES 순서대로 [{ zone, items }] 를 반환한다. */
export function itemsByZone() {
  return ZONES.map((zone) => ({ zone, items: ITEM_CATALOG.filter((it) => it.zone === zone) }));
}
