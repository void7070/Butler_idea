/**
 * 입주·퇴거 기준선(baseline) 점검 폼 모델 (순수 함수).
 * 구역·항목 목록은 GET /api/item-catalog 결과(catalog = { zones, items })를 받는다. 하드코딩 금지.
 *
 * 폼 모델:
 *   entries:        { [itemCode]: { state, description } } — 카탈로그 40개 항목 전부, 기본 normal
 *   zonesConfirmed: ['현관', ...] — "이 구역 이상 없음" 확인한 구역
 *   photos:         { [itemCode]: [{ dataBase64, kind, caption }] } — 항목 사진
 *   extraImages:    항목에 연결되지 않은 사진(구역 전경 등). 편집하지 않고 저장 시 그대로 다시 보낸다.
 * 백엔드에는 이상 항목만 보낸다(정상은 저장하지 않는 규칙).
 */

export const BASELINE_STATES = [
  { code: 'normal', label: '정상' },
  { code: 'minor', label: '경미' },
  { code: 'damaged', label: '손상' },
  { code: 'broken', label: '파손' },
];

export function isAbnormal(state) {
  return !!state && state !== 'normal';
}

function toPhoto(img) {
  return { dataBase64: img.data_base64 ?? img.dataBase64, kind: img.kind ?? '', caption: img.caption ?? '' };
}

/** GET /api/inspections/:id 결과를 폼 모델로 복원한다. */
export function fromInspection(catalog, inspection = {}) {
  const { items = [], images = [], zoneConfirmations = [] } = inspection ?? {};
  const entries = {};
  for (const it of catalog.items) entries[it.code] = { state: 'normal', description: '' };

  const codeById = new Map();
  for (const it of items ?? []) {
    if (!it.item_code || !entries[it.item_code]) continue;
    codeById.set(it.id, it.item_code);
    entries[it.item_code] = { state: it.state ?? 'normal', description: it.description ?? '' };
  }

  const photos = {};
  const extraImages = [];
  for (const img of images ?? []) {
    const code = img.item_id != null ? codeById.get(img.item_id) : undefined;
    if (code) (photos[code] ??= []).push(toPhoto(img));
    else extraImages.push({ ...toPhoto(img), zone: img.zone ?? null });
  }

  const zonesConfirmed = catalog.zones.filter((z) =>
    (zoneConfirmations ?? []).some((c) => c.zone === z && c.role === 'author')
  );
  return { entries, zonesConfirmed, photos, extraImages };
}

/** 구역 일괄 확인: 그 구역 항목을 모두 정상으로 되돌리고(사진도 버린다) zonesConfirmed에 추가한다. */
export function confirmZone(model, catalog, zone) {
  const entries = { ...model.entries };
  const photos = { ...model.photos };
  for (const it of catalog.items) {
    if (it.zone === zone) {
      entries[it.code] = { state: 'normal', description: '' };
      delete photos[it.code];
    }
  }
  const zonesConfirmed = model.zonesConfirmed.includes(zone)
    ? model.zonesConfirmed
    : catalog.zones.filter((z) => z === zone || model.zonesConfirmed.includes(z));
  return { ...model, entries, photos, zonesConfirmed };
}

/**
 * 항목 상태 변경. 이상으로 바꾸면 그 구역의 "이상 없음" 확인은 풀린다.
 * 정상으로 되돌리면 그 항목 사진을 버린다(저장에서 빠지므로, 다시 이상으로 바꿔도 되살아나지 않게).
 */
export function setItemState(model, catalog, code, state) {
  const item = catalog.items.find((it) => it.code === code);
  if (!item) return model;
  const prev = model.entries[code] ?? { state: 'normal', description: '' };
  const entries = { ...model.entries, [code]: { ...prev, state } };
  const zonesConfirmed = isAbnormal(state)
    ? model.zonesConfirmed.filter((z) => z !== item.zone)
    : model.zonesConfirmed;
  let photos = model.photos;
  if (!isAbnormal(state) && photos[code]) {
    photos = { ...photos };
    delete photos[code];
  }
  return { ...model, entries, photos, zonesConfirmed };
}

/** 사진 필수 판정: 핵심 항목이 정상이 아니면 사진이 필요하다. */
export function needsPhoto(item, state) {
  return item?.tier === 'core' && isAbnormal(state);
}

/** 사진이 필요한데 1장도 없는 항목 목록. */
export function missingPhotoItems(model, catalog) {
  return catalog.items.filter(
    (it) => needsPhoto(it, model.entries[it.code]?.state) && !(model.photos[it.code]?.length > 0)
  );
}

/** 구역 탭 표시용: 확인 여부와 이상 항목 수. */
export function zoneStatus(model, catalog, zone) {
  const abnormal = catalog.items.filter((it) => it.zone === zone && isAbnormal(model.entries[it.code]?.state)).length;
  return { confirmed: model.zonesConfirmed.includes(zone), abnormal };
}

/**
 * 제출 전 요약. 구역은 "이상 없음" 확인했거나 이상 항목이 있으면 확인된 것으로 센다(백엔드 제출 규칙과 같음).
 * 사진 수는 저장될 사진(이상 항목 사진 + 기타 사진)만 센다.
 */
export function summarize(model, catalog) {
  const statuses = catalog.zones.map((z) => ({ zone: z, ...zoneStatus(model, catalog, z) }));
  const abnormalItems = catalog.items.filter((it) => isAbnormal(model.entries[it.code]?.state));
  const photoCount =
    abnormalItems.reduce((n, it) => n + (model.photos[it.code]?.length ?? 0), 0) + model.extraImages.length;
  const zonesDone = statuses.filter((s) => s.confirmed || s.abnormal > 0);
  return {
    itemCount: catalog.items.length,
    zoneCount: catalog.zones.length,
    zonesDone: zonesDone.length,
    unconfirmedZones: statuses.filter((s) => !s.confirmed && s.abnormal === 0).map((s) => s.zone),
    abnormalCount: abnormalItems.length,
    photoCount,
    missingPhotos: missingPhotoItems(model, catalog),
  };
}

/**
 * PATCH 페이로드. 이상 항목만 items에 넣고, 사진은 itemCode로 항목에 연결한다.
 * 정상으로 되돌린 항목의 사진은 보내지 않는다(화면에서도 사진 칸이 사라진다).
 */
export function buildSavePayload(model, catalog) {
  const abnormalItems = catalog.items.filter((it) => isAbnormal(model.entries[it.code]?.state));
  const items = abnormalItems.map((it) => ({
    itemCode: it.code,
    state: model.entries[it.code].state,
    description: model.entries[it.code].description || null,
  }));
  const images = [
    ...abnormalItems.flatMap((it) =>
      (model.photos[it.code] ?? []).map((p) => ({ itemCode: it.code, dataBase64: p.dataBase64, kind: p.kind, caption: p.caption }))
    ),
    ...model.extraImages.map((p) => ({ dataBase64: p.dataBase64, zone: p.zone, kind: p.kind, caption: p.caption })),
  ];
  return { items, images, zonesConfirmed: [...model.zonesConfirmed] };
}
