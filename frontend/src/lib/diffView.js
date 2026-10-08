// 입주 ↔ 퇴거 비교 화면(DiffView) 표시용 순수 헬퍼. progress.md 창 5.
// 백엔드 GET /api/reports/compare 응답의 diff({ moveInReportId, moveOutReportId, changes, unchangedCount })를 그대로 쓴다.
// 책임·공제 판단은 하지 않는다. 색·문구·정렬만 정한다.
import { PILL_TONE } from './uiTones.js';

export const STATE_RANK = { unknown: -1, normal: 0, minor: 1, damaged: 2, broken: 3 };

// 목업 ST: 정상 ok / 경미 acc / 손상 warn / 파손 crit / 기록 없음 plain (창 22, 색 = uiTones PILL_TONE)
const STATE_BADGES = {
  normal: { label: '정상', tone: 'ok', class: PILL_TONE.ok },
  minor: { label: '경미', tone: 'acc', class: PILL_TONE.acc },
  damaged: { label: '손상', tone: 'warn', class: PILL_TONE.warn },
  broken: { label: '파손', tone: 'crit', class: PILL_TONE.crit },
  unknown: { label: '기록 없음', tone: 'plain', class: PILL_TONE.plain },
};

export function stateBadge(state) {
  return STATE_BADGES[state] ?? { label: state ?? '', tone: 'plain', class: PILL_TONE.plain };
}

// 청구 가능성: 높음(입주 사진 + 양측 확인) / 보통(양측 확인만) / 낮음(입주 기록 없음)
// 목업 EVID: 높음 acc / 보통 warn / 낮음 plain
const EVIDENCE_BADGES = {
  high: { label: '청구 가능성 높음', tone: 'acc', class: PILL_TONE.acc },
  mid: { label: '청구 가능성 보통', tone: 'warn', class: PILL_TONE.warn },
  low: { label: '청구 가능성 낮음', tone: 'plain', class: PILL_TONE.plain },
};

export function evidenceBadge(evidence) {
  return EVIDENCE_BADGES[evidence] ?? EVIDENCE_BADGES.low;
}

export function tierLabel(tier) {
  return tier === 'core' ? '핵심' : '일반';
}

/**
 * 변경 항목 정렬: 퇴거 상태가 나쁜 순 → 구역 순서(zones) → 원래 순서(카탈로그 순).
 * 원본 배열은 바꾸지 않는다.
 */
export function sortChanges(changes, zones = []) {
  const zoneIndex = (z) => {
    const i = zones.indexOf(z);
    return i === -1 ? zones.length : i;
  };
  return changes
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        (STATE_RANK[b.c.to] ?? 0) - (STATE_RANK[a.c.to] ?? 0) ||
        zoneIndex(a.c.zone) - zoneIndex(b.c.zone) ||
        a.i - b.i
    )
    .map(({ c }) => c);
}

/** 상단 요약 숫자. */
export function summaryCounts(diff) {
  return { changed: diff?.changes?.length ?? 0, unchanged: diff?.unchangedCount ?? 0 };
}

/** 비교 결과의 left/right 중 입주·퇴거 스냅샷을 고른다 (좌우 순서와 무관). */
export function pickSnapshots(result) {
  const moveInId = result?.diff?.moveInReportId;
  const leftIsMoveIn = result?.left?.reportId === moveInId;
  return {
    moveIn: leftIsMoveIn ? result.left : result.right,
    moveOut: leftIsMoveIn ? result.right : result.left,
  };
}

/** 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DD' */
export function formatDate(value) {
  return value ? String(value).slice(0, 10) : '-';
}

/**
 * 변경 항목 카드의 입주 쪽 사진 칸.
 * - 항목 사진이 있으면 그 사진
 * - 없으면 그 구역 전경 사진(item_id 없음, zone 일치)을 "구역 전경"으로 보여 준다
 * - 둘 다 없으면 빈 칸 문구: 입주 기록 없음 / 입주 사진 없음 · 양측 확인 기록 있음 / 입주 사진 없음
 */
export function moveInPhotoCell(change, moveInSnapshot) {
  if (change.from === 'unknown') return { images: [], overview: false, emptyText: '입주 기록 없음' };
  if (change.moveInImages?.length) return { images: change.moveInImages, overview: false, emptyText: '' };

  const overview = (moveInSnapshot?.images ?? []).filter((img) => img.item_id == null && img.zone === change.zone);
  if (overview.length) return { images: overview, overview: true, emptyText: '' };

  const emptyText = change.evidence === 'mid' ? '입주 사진 없음 · 양측 확인 기록 있음' : '입주 사진 없음';
  return { images: [], overview: false, emptyText };
}

/** 퇴거 쪽 사진 칸. */
export function moveOutPhotoCell(change) {
  const images = change.moveOutImages ?? [];
  return { images, overview: false, emptyText: images.length ? '' : '퇴거 사진 없음' };
}

/**
 * 변경 없는 항목을 구역별로 묶는다 (접힌 목록용).
 * @param {{zones:string[], items:Array<{code, zone, name, tier}>}} catalog GET /api/item-catalog
 * @returns {Array<{zone:string, items:Array}>} 항목이 있는 구역만
 */
export function unchangedByZone(catalog, changes) {
  if (!catalog) return [];
  const changed = new Set((changes ?? []).map((c) => c.itemCode));
  return catalog.zones
    .map((zone) => ({
      zone,
      items: catalog.items.filter((it) => it.zone === zone && !changed.has(it.code)),
    }))
    .filter((g) => g.items.length > 0);
}

// 창 8 정산 화면("보증금 공제 근거") 라우트 이름. 창 8에서 이 이름으로 라우트를 추가하면 버튼이 켜진다.
export const SETTLEMENT_ROUTE = 'owner-settlement';

/**
 * "보증금 공제 근거 만들기" 버튼 상태.
 * @param {(name:string)=>boolean} hasRoute router.hasRoute
 */
export function settlementButton(hasRoute, diff) {
  if (!diff || !hasRoute(SETTLEMENT_ROUTE)) {
    return { enabled: false, to: null, notice: '정산 화면은 아직 준비 중입니다.' };
  }
  return {
    enabled: true,
    to: {
      name: SETTLEMENT_ROUTE,
      query: { moveInReportId: diff.moveInReportId, moveOutReportId: diff.moveOutReportId },
    },
    notice: '',
  };
}
