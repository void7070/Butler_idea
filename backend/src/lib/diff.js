/**
 * 입주 전 ↔ 퇴거 스냅샷 비교 (순수 함수, AI 사용 안 함). progress.md 창 4.
 *
 * 카탈로그 전체 항목을 돌며 입주 상태와 퇴거 상태를 구한다.
 * - 스냅샷 items에는 이상 항목만 있다. 기록이 없는 항목은
 *   그 구역이 확인됐으면(zoneConfirmations에 역할 상관없이 1건 이상) normal, 아니면 'unknown'.
 * - 순위 normal < minor < damaged < broken. 퇴거 상태가 입주 상태보다 나쁘면 변경 항목이다.
 *   입주가 unknown이면 퇴거가 이상(minor 이상)일 때 변경으로 본다. 퇴거가 unknown이면 변경이 아니다.
 * - evidence(청구 가능성 근거):
 *   'high' — 입주 때 그 항목 사진이 있거나, 그 구역을 tenant가 확인했고 구역 전경 사진이 있음
 *   'mid'  — 그 구역을 tenant가 확인함
 *   'low'  — tenant 미확인, 또는 입주 상태가 unknown
 * 책임·공제 여부는 판단하지 않는다(정산은 창 7에서 사람이 부담자를 고른다).
 *
 * 임차인 입주 제보 (창 10, extras):
 * - extras.tenantZones: 리포트 발행 뒤 임차인이 확인한 구역(zone_confirmations role='tenant').
 *   스냅샷은 불변이라 따로 받아 스냅샷의 구역 확인과 합친다.
 * - extras.tenantReports: 입주 리포트에 대한 임차인 제보. 'approved'만 입주 상태로 반영한다
 *   (기록 상태와 제보 상태 중 더 나쁜 쪽). 승인 = 양측 확인이므로 evidence는 최소 'mid',
 *   제보 사진이 있으면 'high'이고 그 사진을 moveInImages에 붙인다.
 *   'rejected'만 있는 항목이 변경 항목이면 disputed: true (임차인은 입주 때 이상을 주장했으나 임대인 거절).
 */

export const STATE_RANK = { normal: 0, minor: 1, damaged: 2, broken: 3 };

/** 스냅샷에서 항목 상태 조회에 필요한 색인을 만든다. */
function indexSnapshot(snapshot, extraTenantZones = []) {
  const items = (snapshot?.items ?? []).filter((it) => it.item_code);
  const images = snapshot?.images ?? [];
  const confirmations = snapshot?.zoneConfirmations ?? [];

  const itemByCode = new Map(items.map((it) => [it.item_code, it]));
  const confirmedZones = new Set([...confirmations.map((c) => c.zone), ...extraTenantZones]);
  const tenantZones = new Set([
    ...confirmations.filter((c) => c.role === 'tenant').map((c) => c.zone),
    ...extraTenantZones,
  ]);
  const zonesWithOverview = new Set(images.filter((img) => img.zone && img.item_id == null).map((img) => img.zone));

  const imagesOf = (item) => (item ? images.filter((img) => img.item_id === item.id) : []);

  const stateOf = (entry) => {
    const item = itemByCode.get(entry.code);
    if (item) return item.state;
    return confirmedZones.has(entry.zone) ? 'normal' : 'unknown';
  };

  return { itemByCode, tenantZones, zonesWithOverview, imagesOf, stateOf };
}

function worseOf(a, b) {
  if (!(a in STATE_RANK)) return b;
  return STATE_RANK[b] > STATE_RANK[a] ? b : a;
}

/** 제보 사진 → 스냅샷 사진과 같은 모양 (DiffView가 그대로 쓴다). */
function tenantReportImage(r) {
  return {
    id: `tenant-report-${r.id}`,
    item_id: null,
    zone: null,
    kind: 'tenant_report',
    caption: `임차인 제보 · ${r.text}`,
    byte_size: null,
    data_base64: r.imageBase64,
  };
}

function isWorse(from, to) {
  if (to === 'unknown' || !(to in STATE_RANK)) return false;
  if (from === 'unknown' || !(from in STATE_RANK)) return STATE_RANK[to] > STATE_RANK.normal;
  return STATE_RANK[to] > STATE_RANK[from];
}

/**
 * @param {object} moveInSnapshot  입주 전 리포트 스냅샷 (items, images, zoneConfirmations)
 * @param {object} moveOutSnapshot 퇴거 전/후 리포트 스냅샷
 * @param {Array<{code:string, zone:string, name:string, tier:string}>} catalog 항목 카탈로그 (ITEM_CATALOG)
 * @param {{ tenantZones?: string[], tenantReports?: Array<{id, itemCode, state, text, imageBase64, status}> }} [extras]
 * @returns {{changes: Array<{itemCode, zone, name, tier, from, to, evidence, moveInImages, moveOutImages, tenantReported, disputed}>, unchangedCount:number}}
 *   tenantReported: 승인된 제보가 입주 상태에 반영됨
 *   unchangedCount = 카탈로그 항목 수 − 변경 항목 수 (퇴거 상태를 알 수 없는 항목도 포함)
 */
export function diffBaseline(moveInSnapshot, moveOutSnapshot, catalog, extras = {}) {
  const moveIn = indexSnapshot(moveInSnapshot, extras.tenantZones ?? []);
  const reports = extras.tenantReports ?? [];
  const moveOut = indexSnapshot(moveOutSnapshot);
  const changes = [];

  for (const entry of catalog) {
    const approved = reports.filter((r) => r.itemCode === entry.code && r.status === 'approved');
    const rejected = reports.filter((r) => r.itemCode === entry.code && r.status === 'rejected');

    const from = approved.reduce((s, r) => worseOf(s, r.state), moveIn.stateOf(entry));
    const to = moveOut.stateOf(entry);
    if (!isWorse(from, to)) continue;

    const reportImages = approved.filter((r) => r.imageBase64).map(tenantReportImage);
    const moveInImages = [...moveIn.imagesOf(moveIn.itemByCode.get(entry.code)), ...reportImages];
    const tenantConfirmed = moveIn.tenantZones.has(entry.zone) || approved.length > 0;

    let evidence = 'low';
    if (from !== 'unknown') {
      if (moveInImages.length > 0 || (tenantConfirmed && moveIn.zonesWithOverview.has(entry.zone))) {
        evidence = 'high';
      } else if (tenantConfirmed) {
        evidence = 'mid';
      }
    }

    changes.push({
      itemCode: entry.code,
      zone: entry.zone,
      name: entry.name,
      tier: entry.tier,
      from,
      to,
      evidence,
      moveInImages,
      moveOutImages: moveOut.imagesOf(moveOut.itemByCode.get(entry.code)),
      tenantReported: approved.length > 0,
      disputed: approved.length === 0 && rejected.length > 0,
    });
  }

  return { changes, unchangedCount: catalog.length - changes.length };
}
