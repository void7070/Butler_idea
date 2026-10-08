import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BaselineInspectionForm from '../src/components/BaselineInspectionForm.vue';
import { fromInspection, setItemState, confirmZone } from '../src/lib/baselineInspection.js';
import {
  REASON_REPAIR_CHECK,
  canCarryOver,
  applyCarryover,
  fromSavedCarryover,
  clearRepairCheck,
  afterStateChange,
  carryoverBadge,
  carryoverSummary,
  carryoverPayload,
  submitWarning,
  pendingRepairChecks,
  previewImages,
} from '../src/lib/carryoverView.js';
import { kindMeta } from '../src/lib/houseLogView.js';

const catalog = {
  zones: ['현관', '거실'],
  items: [
    { code: 'ENTRANCE_DOOR', zone: '현관', name: '현관문', tier: 'core' },
    { code: 'ENTRANCE_DOORLOCK', zone: '현관', name: '도어락', tier: 'general' },
    { code: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core' },
    { code: 'LIVING_LIGHT', zone: '거실', name: '조명', tier: 'general' },
  ],
};
const INHERIT = '이전 퇴거 상태 이어받음';
const PHOTO = 'data:image/png;base64,AAAA';
// 확정된 정산: 벽지는 정산 항목(수리 확인), 도어락은 정산 밖(이어받음)
const SOURCE = {
  sourceReportId: 5,
  sourceDate: '2026-03-02',
  items: [
    {
      itemCode: 'ENTRANCE_DOORLOCK',
      state: 'minor',
      description: '버튼 마모',
      suggestedState: 'minor',
      needsRepairCheck: false,
      reason: INHERIT,
      moveOutImages: [],
    },
    {
      itemCode: 'LIVING_WALLPAPER',
      state: 'damaged',
      description: '찢김',
      suggestedState: 'normal',
      needsRepairCheck: true,
      reason: REASON_REPAIR_CHECK,
      moveOutImages: [{ caption: '벽지', data_base64: PHOTO }],
    },
  ],
};
const base = () => ({ ...fromInspection(catalog, {}), carryover: null });

describe('carryoverView', () => {
  it('입주 전 점검만 가져오기 가능', () => {
    expect(canCarryOver({ type: 'move_in' })).toBe(true);
    expect(canCarryOver({ type: 'move_out_post' })).toBe(false);
  });

  it('applyCarryover: 제안 상태를 채우고, 수리 확인 항목은 정상 + 노란 표시, 구역 확인은 가져오지 않는다', () => {
    let m = confirmZone(base(), catalog, '현관'); // 작성자가 먼저 현관을 확인해 둔 상태
    m = applyCarryover(m, catalog, SOURCE);
    expect(m.entries.ENTRANCE_DOORLOCK).toEqual({ state: 'minor', description: '버튼 마모' });
    expect(m.entries.LIVING_WALLPAPER).toEqual({ state: 'normal', description: '' });
    expect(m.zonesConfirmed).toEqual([]); // 이상으로 채운 현관은 확인이 풀리고, 거실은 새로 확인해야 한다
    expect(carryoverBadge(m, 'LIVING_WALLPAPER')).toMatchObject({ label: '이전 기록', reason: REASON_REPAIR_CHECK, pending: true });
    expect(carryoverBadge(m, 'ENTRANCE_DOORLOCK')).toMatchObject({ pending: false, reason: INHERIT });
    expect(carryoverBadge(m, 'LIVING_LIGHT')).toBeNull();
    expect(carryoverSummary(m, catalog).text).toBe('이전 기록에서 2개 가져옴 · 수리 확인 1개');
    expect(previewImages(SOURCE, 'LIVING_WALLPAPER')).toHaveLength(1);
  });

  it('확인 표시 해제: 버튼 또는 이상으로 바꾸기. 정상 클릭은 그대로', () => {
    const m = applyCarryover(base(), catalog, SOURCE);
    expect(pendingRepairChecks(m, catalog).map((it) => it.code)).toEqual(['LIVING_WALLPAPER']);
    expect(submitWarning(m, catalog)).toContain('거실 벽지');

    const cleared = clearRepairCheck(m, 'LIVING_WALLPAPER');
    expect(pendingRepairChecks(cleared, catalog)).toEqual([]);
    expect(submitWarning(cleared, catalog)).toBeNull();
    expect(carryoverSummary(cleared, catalog).text).toBe('이전 기록에서 2개 가져옴 · 수리 확인 모두 완료');
    expect(carryoverBadge(cleared, 'LIVING_WALLPAPER').reason).toBe(REASON_REPAIR_CHECK); // 뱃지·사유는 남는다

    const normalClick = afterStateChange(setItemState(m, catalog, 'LIVING_WALLPAPER', 'normal'), 'LIVING_WALLPAPER', 'normal');
    expect(carryoverBadge(normalClick, 'LIVING_WALLPAPER').pending).toBe(true);
    const found = afterStateChange(setItemState(m, catalog, 'LIVING_WALLPAPER', 'minor'), 'LIVING_WALLPAPER', 'minor');
    expect(carryoverBadge(found, 'LIVING_WALLPAPER').pending).toBe(false);
  });

  it('저장 본문과 복원: carryover { sourceReportId, items: [itemCode, reason, repairCheckPending] }', () => {
    expect(carryoverPayload(base())).toEqual({});
    const m = applyCarryover(base(), catalog, SOURCE);
    const payload = carryoverPayload(m);
    expect(payload).toEqual({
      carryover: {
        sourceReportId: 5,
        items: [
          { itemCode: 'ENTRANCE_DOORLOCK', reason: INHERIT, repairCheckPending: false },
          { itemCode: 'LIVING_WALLPAPER', reason: REASON_REPAIR_CHECK, repairCheckPending: true },
        ],
      },
    });
    const restored = { ...m, carryover: fromSavedCarryover(payload.carryover) };
    expect(carryoverSummary(restored, catalog).text).toBe('이전 기록에서 2개 가져옴 · 수리 확인 1개');
    expect(fromSavedCarryover(null)).toBeNull();
  });

  it('House Log 종류 carryover는 점검 필터', () => {
    expect(kindMeta('carryover')).toMatchObject({ group: 'inspection', label: '이전 기록 이어받음' });
  });
});

describe('BaselineInspectionForm · 이전 퇴거 기록 가져오기', () => {
  afterEach(() => vi.unstubAllGlobals());

  const mountForm = (props = {}) =>
    mount(BaselineInspectionForm, {
      props: { catalog, initialInspection: { type: 'move_in' }, carryoverEnabled: true, ...props },
    });

  it('버튼 → request-carryover, 채우기 → 뱃지·노란 표시·요약, 확인 완료로 표시 해제', async () => {
    const w = mountForm({ carryoverSource: SOURCE });
    await w.find('[data-test="carryover-button"]').trigger('click');
    expect(w.emitted('request-carryover')).toHaveLength(1);

    w.vm.applyCarryoverSource(SOURCE);
    await w.vm.$nextTick();
    expect(w.find('[data-test="carryover-summary"]').text()).toContain('이전 기록에서 2개 가져옴 · 수리 확인 1개');
    expect(w.emitted('save').at(-1)[0].carryover.items).toHaveLength(2);
    expect(w.vm.getSubmitWarning()).toContain('거실 벽지');

    // 현관 탭: 도어락 이어받음 (이상)
    expect(w.find('[data-test="item-ENTRANCE_DOORLOCK"] [data-test="carryover-badge"]').exists()).toBe(true);
    // 거실 탭: 벽지 노란 표시 + 퇴거 사진 미리보기
    await w.findAll('button').find((b) => b.text().startsWith('거실')).trigger('click');
    const wall = w.find('[data-test="item-LIVING_WALLPAPER"]');
    expect(wall.classes()).toContain('bg-warn-soft');
    expect(wall.find('img').attributes('src')).toBe(PHOTO);
    await wall.find('[data-test="clear-repair-check"]').trigger('click');
    expect(w.find('[data-test="item-LIVING_WALLPAPER"]').classes()).not.toContain('bg-warn-soft');
    expect(w.find('[data-test="carryover-summary"]').text()).toContain('수리 확인 모두 완료');
    expect(w.vm.getSubmitWarning()).toBeNull();
    expect(w.vm.getPayload().carryover.items.find((it) => it.itemCode === 'LIVING_WALLPAPER').repairCheckPending).toBe(false);
  });

  it('입주 전 점검이 아니면 버튼이 없다, 다시 가져오기는 확인 창', async () => {
    expect(mountForm({ carryoverEnabled: false }).find('[data-test="carryover-button"]').exists()).toBe(false);

    const w = mountForm({
      initialInspection: {
        type: 'move_in',
        carryover: { sourceReportId: 5, items: [{ itemCode: 'LIVING_WALLPAPER', reason: REASON_REPAIR_CHECK, repairCheckPending: true }] },
      },
    });
    expect(w.find('[data-test="carryover-summary"]').text()).toContain('수리 확인 1개');
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    await w.find('[data-test="carryover-button"]').trigger('click');
    expect(confirm).toHaveBeenCalled();
    expect(w.emitted('request-carryover')).toBeUndefined();
  });
});
