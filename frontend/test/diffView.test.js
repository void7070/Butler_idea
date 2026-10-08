import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import DiffView from '../src/components/DiffView.vue';
import {
  stateBadge,
  evidenceBadge,
  tierLabel,
  sortChanges,
  summaryCounts,
  pickSnapshots,
  formatDate,
  moveInPhotoCell,
  moveOutPhotoCell,
  unchangedByZone,
  settlementButton,
  SETTLEMENT_ROUTE,
} from '../src/lib/diffView.js';

const PNG = 'data:image/png;base64,AAAA';
const img = (id, extra = {}) => ({ id, item_id: null, zone: null, data_base64: PNG, ...extra });

// 시연 기준 데이터 4건 (백엔드 diff 응답 형태)
const wallpaper = { itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high', moveInImages: [], moveOutImages: [img(11, { item_id: 5 })] };
const silicone = { itemCode: 'BATH_SILICONE', zone: '화장실', name: '실리콘', tier: 'core', from: 'minor', to: 'damaged', evidence: 'mid', moveInImages: [], moveOutImages: [] };
const hood = { itemCode: 'KITCHEN_HOOD', zone: '주방', name: '후드 필터', tier: 'general', from: 'normal', to: 'minor', evidence: 'high', moveInImages: [img(3, { item_id: 2 })], moveOutImages: [] };
const screen = { itemCode: 'VERANDA_SCREEN', zone: '베란다', name: '방충망', tier: 'general', from: 'unknown', to: 'damaged', evidence: 'low', moveInImages: [], moveOutImages: [] };
const ZONES = ['현관', '거실', '주방', '화장실', '방1', '방2', '베란다'];

const moveInSnap = {
  reportId: 1,
  generatedAt: '2024-09-01 10:00:00',
  unit: { building: '노원 그린아파트', name: '1234호' },
  inspection: { typeLabel: '입주 전 점검' },
  images: [img(21, { zone: '거실' })], // 거실 전경
};
const moveOutSnap = {
  reportId: 2,
  generatedAt: '2026-09-01 10:00:00',
  unit: { building: '노원 그린아파트', name: '1234호' },
  inspection: { typeLabel: '퇴거 후 점검' },
  images: [],
};
const diff = { moveInReportId: 1, moveOutReportId: 2, changes: [hood, screen, silicone, wallpaper], unchangedCount: 36 };

describe('배지 라벨·색', () => {
  it('상태 색: 정상 ok / 경미 acc / 손상 warn / 파손 crit / unknown plain', () => {
    expect(stateBadge('normal')).toMatchObject({ label: '정상' });
    expect(stateBadge('normal').class).toContain('text-ok');
    expect(stateBadge('minor').class).toContain('text-accent');
    expect(stateBadge('damaged')).toMatchObject({ label: '손상' });
    expect(stateBadge('damaged').class).toContain('text-warn');
    expect(stateBadge('broken').class).toContain('text-crit');
    expect(stateBadge('unknown')).toMatchObject({ label: '기록 없음' });
  });

  it('청구 가능성 높음/보통/낮음, 모르는 값은 낮음', () => {
    expect(evidenceBadge('high').label).toContain('높음');
    expect(evidenceBadge('mid').label).toContain('보통');
    expect(evidenceBadge('low').label).toContain('낮음');
    expect(evidenceBadge(undefined).label).toContain('낮음');
  });

  it('핵심/일반', () => {
    expect(tierLabel('core')).toBe('핵심');
    expect(tierLabel('general')).toBe('일반');
  });
});

describe('sortChanges', () => {
  it('퇴거 상태가 나쁜 순 → 구역 순서, 원본은 그대로', () => {
    const input = [hood, screen, silicone, wallpaper];
    const sorted = sortChanges(input, ZONES).map((c) => c.name);
    expect(sorted).toEqual(['벽지', '실리콘', '방충망', '후드 필터']);
    expect(input[0]).toBe(hood);
  });

  it('파손이 손상보다 먼저', () => {
    const broken = { ...hood, to: 'broken' };
    expect(sortChanges([wallpaper, broken], ZONES)[0]).toBe(broken);
  });
});

describe('요약·스냅샷·날짜', () => {
  it('변경 n · 변경 없음 n', () => {
    expect(summaryCounts(diff)).toEqual({ changed: 4, unchanged: 36 });
  });

  it('좌우 순서와 상관없이 입주·퇴거 스냅샷을 고른다', () => {
    expect(pickSnapshots({ left: moveInSnap, right: moveOutSnap, diff }).moveIn).toBe(moveInSnap);
    const swapped = pickSnapshots({ left: moveOutSnap, right: moveInSnap, diff });
    expect(swapped.moveIn).toBe(moveInSnap);
    expect(swapped.moveOut).toBe(moveOutSnap);
  });

  it('날짜만 자른다', () => {
    expect(formatDate('2024-09-01 10:00:00')).toBe('2024-09-01');
    expect(formatDate(null)).toBe('-');
  });
});

describe('사진 칸', () => {
  it('입주 항목 사진이 있으면 그 사진', () => {
    expect(moveInPhotoCell(hood, moveInSnap)).toMatchObject({ images: hood.moveInImages, overview: false });
  });

  it('항목 사진이 없으면 같은 구역 전경 사진', () => {
    const cell = moveInPhotoCell(wallpaper, moveInSnap);
    expect(cell.overview).toBe(true);
    expect(cell.images.map((i) => i.id)).toEqual([21]);
  });

  it('사진 없고 양측 확인만 있으면 안내 문구', () => {
    expect(moveInPhotoCell(silicone, moveInSnap)).toMatchObject({ images: [], emptyText: '입주 사진 없음 · 양측 확인 기록 있음' });
  });

  it('입주 unknown이면 "입주 기록 없음"', () => {
    expect(moveInPhotoCell(screen, moveInSnap).emptyText).toBe('입주 기록 없음');
  });

  it('확인 기록도 사진도 없으면 "입주 사진 없음"', () => {
    expect(moveInPhotoCell({ ...silicone, evidence: 'low' }, moveInSnap).emptyText).toBe('입주 사진 없음');
  });

  it('퇴거 사진', () => {
    expect(moveOutPhotoCell(wallpaper).images).toHaveLength(1);
    expect(moveOutPhotoCell(silicone).emptyText).toBe('퇴거 사진 없음');
  });
});

describe('unchangedByZone', () => {
  it('변경 항목을 뺀 나머지를 구역별로, 빈 구역은 제외', () => {
    const catalog = {
      zones: ['현관', '거실'],
      items: [
        { code: 'ENTRANCE_DOOR', zone: '현관', name: '현관문' },
        { code: 'LIVING_WALLPAPER', zone: '거실', name: '벽지' },
      ],
    };
    expect(unchangedByZone(catalog, [wallpaper])).toEqual([{ zone: '현관', items: [catalog.items[0]] }]);
    expect(unchangedByZone(null, [wallpaper])).toEqual([]);
  });
});

describe('settlementButton', () => {
  it('정산 라우트가 없으면 비활성 + 안내', () => {
    const b = settlementButton(() => false, diff);
    expect(b.enabled).toBe(false);
    expect(b.notice).toContain('준비 중');
  });

  it('정산 라우트가 있으면 입주·퇴거 리포트 id를 넘긴다', () => {
    const b = settlementButton((name) => name === SETTLEMENT_ROUTE, diff);
    expect(b).toMatchObject({
      enabled: true,
      to: { name: SETTLEMENT_ROUTE, query: { moveInReportId: 1, moveOutReportId: 2 } },
    });
  });
});

describe('DiffView 컴포넌트', () => {
  it('요약, 정렬된 카드, 비활성 버튼', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    const wrapper = mount(DiffView, {
      props: { result: { left: moveOutSnap, right: moveInSnap, diff }, catalog: { zones: ZONES, items: [] } },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('입주 2024-09-01');
    expect(wrapper.text()).toContain('같은 호실');
    expect(wrapper.get('[data-test="diff-summary"]').text()).toContain('변경 4 · 변경 없음 36');
    const cards = wrapper.findAll('[data-test="diff-card"]');
    expect(cards).toHaveLength(4);
    expect(cards[0].text()).toContain('벽지');
    expect(cards[1].text()).toContain('입주 사진 없음 · 양측 확인 기록 있음');
    expect(cards[2].text()).toContain('입주 기록 없음');
    expect(wrapper.get('[data-test="settlement-button"]').attributes('disabled')).toBeDefined();
  });
});
