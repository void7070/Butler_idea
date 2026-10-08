/**
 * 문제 항목 점검 폼 모델 ↔ 백엔드 페이로드 변환 (순수 함수).
 * 폼 모델: 각 문제 항목이 현장 확인(observations)을 중첩으로 가진다.
 * 백엔드: items[] 와 observations[](itemIndex로 항목에 연결) 로 평탄화.
 */

export function newIssueItem() {
  return { category: '', name: '', state: 'minor', location: '', description: '', observations: [] };
}

export function newObservation() {
  return { label: '', value: 'present' };
}

/** GET 결과(items+observations)를 폼 모델(중첩)로 복원한다. */
export function fromInspection(items = [], observations = []) {
  return (items ?? []).map((it) => ({
    category: it.category ?? '',
    name: it.name ?? '',
    state: it.state ?? 'minor',
    location: it.location ?? '',
    description: it.description ?? '',
    observations: (observations ?? [])
      .filter((o) => o.item_id === it.id)
      .map((o) => ({ label: o.label, value: o.value })),
  }));
}

/** 폼 모델을 PATCH 페이로드로 평탄화한다. (라벨 없는 관찰 항목은 제외) */
export function buildSavePayload(formItems = []) {
  const items = formItems.map((it) => ({
    category: it.category,
    name: it.name,
    state: it.state,
    location: it.location,
    description: it.description,
  }));
  const observations = formItems.flatMap((it, idx) =>
    (it.observations ?? [])
      .filter((o) => o.label)
      .map((o) => ({ itemIndex: idx, label: o.label, value: o.value }))
  );
  return { items, observations };
}

// ── 수리 전·수리 후 점검 (창 26): 항목마다 사진 필수 ──────────────────────

export const REPAIR_TYPES = ['repair_pre', 'repair_post'];

export const isRepairType = (type) => REPAIR_TYPES.includes(type);

/**
 * 백엔드 images를 항목별 사진(itemIndex 순서 = items 순서)과 항목에 붙지 않은 사진으로 나눈다.
 * → { photos: Array<Array<photo>>, extraImages: Array<photo> }
 */
export function splitImages(items = [], images = []) {
  const indexById = new Map((items ?? []).map((it, i) => [it.id, i]));
  const photos = (items ?? []).map(() => []);
  const extraImages = [];
  for (const img of images ?? []) {
    const photo = { dataBase64: img.data_base64 ?? img.dataBase64, kind: img.kind ?? '', caption: img.caption ?? '' };
    const idx = img.item_id != null ? indexById.get(img.item_id) : undefined;
    if (idx !== undefined) photos[idx].push(photo);
    else extraImages.push(photo);
  }
  return { photos, extraImages };
}

/**
 * 항목별 사진 → images 페이로드(itemIndex로 연결) + 항목에 붙지 않은 사진.
 * items를 바꾸면 항목 사진은 지워지므로(FK) 수리 전·후 폼은 항상 items와 함께 보낸다.
 */
export function buildImagesPayload(photosByItem = [], extraImages = []) {
  return [
    ...photosByItem.flatMap((photos, itemIndex) =>
      (photos ?? []).map((p) => ({ itemIndex, dataBase64: p.dataBase64, kind: p.kind, caption: p.caption }))
    ),
    ...(extraImages ?? []).map((p) => ({ dataBase64: p.dataBase64, kind: p.kind, caption: p.caption })),
  ];
}

/** 제출 전 요약: 사진 없는 항목(1부터 번호) + 문구. 항목이 없으면 그것도 알린다. */
export function repairPhotoSummary(photosByItem = []) {
  const missing = photosByItem.map((p, i) => (p?.length ? null : i + 1)).filter((n) => n !== null);
  let text;
  if (!photosByItem.length) text = '문제 항목을 1개 이상 기록해야 제출할 수 있습니다.';
  else if (missing.length) text = `사진 없는 항목 ${missing.length}개 (문제 항목 ${missing.join(', ')})`;
  else text = '모든 항목에 사진이 있습니다.';
  return { missing, ok: photosByItem.length > 0 && missing.length === 0, text };
}

/**
 * 수리 후 점검의 "수리 전 리포트 선택" 목록: 같은 호실의 수리 전 리포트만, 최신순.
 * @param {Array<{ id, type, unitId, createdAt }>} reports  GET /api/reports 결과
 */
export function repairPreOptions(reports = [], unitId) {
  return (reports ?? [])
    .filter((r) => r.type === 'repair_pre' && r.unitId === unitId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
    .map((r) => ({ id: r.id, label: `수리 전 점검 리포트 #${r.id} · ${String(r.createdAt ?? '').slice(0, 10)}` }));
}
