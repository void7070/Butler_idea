import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaselineInspectionForm from '../src/components/BaselineInspectionForm.vue';
import {
  fromInspection,
  confirmZone,
  setItemState,
  needsPhoto,
  missingPhotoItems,
  zoneStatus,
  summarize,
  buildSavePayload,
} from '../src/lib/baselineInspection.js';

// 백엔드 카탈로그 축소판 (GET /api/item-catalog 형태)
const catalog = {
  zones: ['현관', '거실'],
  items: [
    { code: 'ENTRANCE_DOOR', zone: '현관', name: '현관문', tier: 'core' },
    { code: 'ENTRANCE_DOORLOCK', zone: '현관', name: '도어락', tier: 'general' },
    { code: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core' },
    { code: 'LIVING_LIGHT', zone: '거실', name: '조명', tier: 'general' },
  ],
};
const PNG = 'data:image/png;base64,AAAA';
const empty = () => fromInspection(catalog, {});

describe('fromInspection', () => {
  it('모든 항목 기본값 정상, 저장된 이상 항목·사진·구역 확인을 복원', () => {
    const m = fromInspection(catalog, {
      items: [{ id: 7, item_code: 'LIVING_WALLPAPER', state: 'damaged', description: '찢어짐' }],
      images: [
        { item_id: 7, data_base64: PNG, kind: '근접', caption: '' },
        { item_id: null, zone: '현관', data_base64: PNG },
      ],
      zoneConfirmations: [{ zone: '현관', role: 'author' }, { zone: '거실', role: 'tenant' }],
    });
    expect(m.entries.ENTRANCE_DOOR.state).toBe('normal');
    expect(m.entries.LIVING_WALLPAPER).toEqual({ state: 'damaged', description: '찢어짐' });
    expect(m.photos.LIVING_WALLPAPER).toHaveLength(1);
    expect(m.extraImages).toEqual([{ dataBase64: PNG, kind: '', caption: '', zone: '현관' }]);
    expect(m.zonesConfirmed).toEqual(['현관']); // 작성자 확인만
  });
});

describe('구역 일괄 확인', () => {
  it('그 구역 항목을 모두 정상으로 되돌리고 zonesConfirmed에 추가', () => {
    let m = setItemState(empty(), catalog, 'ENTRANCE_DOOR', 'broken');
    m = setItemState(m, catalog, 'LIVING_LIGHT', 'minor');
    m = confirmZone(m, catalog, '현관');
    expect(m.entries.ENTRANCE_DOOR.state).toBe('normal');
    expect(m.entries.LIVING_LIGHT.state).toBe('minor'); // 다른 구역은 그대로
    expect(m.zonesConfirmed).toEqual(['현관']);
  });

  it('두 번 확인해도 중복되지 않고, 구역 순서를 따른다', () => {
    let m = confirmZone(empty(), catalog, '거실');
    m = confirmZone(m, catalog, '현관');
    m = confirmZone(m, catalog, '현관');
    expect(m.zonesConfirmed).toEqual(['현관', '거실']);
  });

  it('확인한 구역에 이상 항목을 기록하면 확인이 풀린다', () => {
    let m = confirmZone(empty(), catalog, '현관');
    m = setItemState(m, catalog, 'ENTRANCE_DOORLOCK', 'minor');
    expect(m.zonesConfirmed).toEqual([]);
    expect(zoneStatus(m, catalog, '현관')).toEqual({ confirmed: false, abnormal: 1 });
  });
});

describe('정상으로 되돌리면 사진 제거', () => {
  const withPhotos = () => {
    let m = setItemState(empty(), catalog, 'ENTRANCE_DOOR', 'damaged');
    m = setItemState(m, catalog, 'LIVING_WALLPAPER', 'damaged');
    return { ...m, photos: { ENTRANCE_DOOR: [{ dataBase64: PNG }], LIVING_WALLPAPER: [{ dataBase64: PNG }] } };
  };

  it('정상 → 다시 이상으로 바꿔도 사진이 되살아나지 않는다', () => {
    let m = setItemState(withPhotos(), catalog, 'ENTRANCE_DOOR', 'normal');
    m = setItemState(m, catalog, 'ENTRANCE_DOOR', 'minor');
    expect(m.photos.ENTRANCE_DOOR).toBeUndefined();
    expect(m.photos.LIVING_WALLPAPER).toHaveLength(1); // 다른 항목은 그대로
    expect(missingPhotoItems(m, catalog).map((it) => it.code)).toEqual(['ENTRANCE_DOOR']);
  });

  it('이상 단계끼리 바꿀 때는 사진 유지', () => {
    const m = setItemState(withPhotos(), catalog, 'ENTRANCE_DOOR', 'broken');
    expect(m.photos.ENTRANCE_DOOR).toHaveLength(1);
  });

  it('구역 일괄 확인도 그 구역 사진만 버린다', () => {
    const m = confirmZone(withPhotos(), catalog, '현관');
    expect(m.photos.ENTRANCE_DOOR).toBeUndefined();
    expect(m.photos.LIVING_WALLPAPER).toHaveLength(1);
  });
});

describe('사진 필수 판정', () => {
  it('핵심 항목이 정상이 아닐 때만 사진 필수', () => {
    const [door, lock] = catalog.items;
    expect(needsPhoto(door, 'normal')).toBe(false);
    expect(needsPhoto(door, 'minor')).toBe(true);
    expect(needsPhoto(lock, 'broken')).toBe(false);
  });

  it('사진 없는 핵심 이상 항목만 missing으로 잡는다', () => {
    let m = setItemState(empty(), catalog, 'ENTRANCE_DOOR', 'damaged');
    m = setItemState(m, catalog, 'LIVING_WALLPAPER', 'damaged');
    m = setItemState(m, catalog, 'LIVING_LIGHT', 'broken');
    m = { ...m, photos: { LIVING_WALLPAPER: [{ dataBase64: PNG, kind: '', caption: '' }] } };
    expect(missingPhotoItems(m, catalog).map((it) => it.code)).toEqual(['ENTRANCE_DOOR']);
  });
});

describe('요약 계산', () => {
  it('항목 수 · 구역 확인(확인 또는 이상 있음) · 이상 수 · 저장될 사진 수', () => {
    let m = confirmZone(empty(), catalog, '현관');
    m = setItemState(m, catalog, 'LIVING_WALLPAPER', 'damaged');
    m = {
      ...m,
      photos: {
        LIVING_WALLPAPER: [{ dataBase64: PNG }, { dataBase64: PNG }],
        LIVING_LIGHT: [{ dataBase64: PNG }], // 정상 항목 사진은 세지 않는다
      },
      extraImages: [{ dataBase64: PNG, zone: '현관' }],
    };
    const s = summarize(m, catalog);
    expect(s).toMatchObject({ itemCount: 4, zoneCount: 2, zonesDone: 2, abnormalCount: 1, photoCount: 3 });
    expect(s.unconfirmedZones).toEqual([]);
    expect(s.missingPhotos).toEqual([]);
  });

  it('빈 폼은 모든 구역이 미확인', () => {
    const s = summarize(empty(), catalog);
    expect(s.zonesDone).toBe(0);
    expect(s.unconfirmedZones).toEqual(['현관', '거실']);
  });
});

describe('buildSavePayload', () => {
  it('이상 항목만 보내고 사진은 itemCode로 연결, 기타 사진은 구역과 함께 보존', () => {
    let m = confirmZone(empty(), catalog, '현관');
    m = setItemState(m, catalog, 'LIVING_WALLPAPER', 'damaged');
    m.entries.LIVING_WALLPAPER.description = '찢어짐';
    m = {
      ...m,
      photos: { LIVING_WALLPAPER: [{ dataBase64: PNG, kind: '근접', caption: '' }], LIVING_LIGHT: [{ dataBase64: PNG }] },
      extraImages: [{ dataBase64: PNG, zone: '현관', kind: '', caption: '' }],
    };
    expect(buildSavePayload(m, catalog)).toEqual({
      items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged', description: '찢어짐' }],
      images: [
        { itemCode: 'LIVING_WALLPAPER', dataBase64: PNG, kind: '근접', caption: '' },
        { dataBase64: PNG, zone: '현관', kind: '', caption: '' },
      ],
      zonesConfirmed: ['현관'],
    });
  });
});

describe('BaselineInspectionForm', () => {
  it('구역 탭을 카탈로그로 그리고, 일괄 확인 후 저장하면 zonesConfirmed가 담긴다', async () => {
    const w = mount(BaselineInspectionForm, { props: { catalog } });
    expect(w.text()).toContain('현관문');
    expect(w.text()).toContain('핵심');
    expect(w.find('[data-test="baseline-summary"]').text()).toContain('구역 확인 0/2');

    await w.findAll('button').find((b) => b.text().includes('한 번에 확인')).trigger('click');
    expect(w.text()).toContain('✓ 확인');
    await w.findAll('button').find((b) => b.text() === '저장').trigger('click');
    expect(w.emitted('save')[0][0].zonesConfirmed).toEqual(['현관']);
  });

  it('핵심 항목을 이상으로 바꾸면 사진 칸과 "사진 필수"가 나온다', async () => {
    const w = mount(BaselineInspectionForm, { props: { catalog } });
    expect(w.text()).not.toContain('사진 필수');
    await w.findAll('button').find((b) => b.text() === '손상').trigger('click'); // 첫 항목 = 현관문(핵심)
    expect(w.text()).toContain('사진 필수');
    expect(w.text()).toContain('현관문 사진');
  });

  it('사진을 넣은 항목을 정상으로 되돌렸다가 다시 이상으로 바꾸면 사진 칸이 비어 있다', async () => {
    const w = mount(BaselineInspectionForm, { props: { catalog } });
    const click = (label) => w.findAll('button').find((b) => b.text() === label).trigger('click'); // 첫 항목 = 현관문
    await click('손상');
    w.findComponent({ name: 'PhotoUploader' }).vm.$emit('save', [{ dataBase64: PNG, kind: '', caption: '' }]);
    await w.vm.$nextTick();
    expect(w.find('[data-test="baseline-summary"]').text()).toContain('사진 1');
    await click('정상');
    await click('경미');
    expect(w.findComponent({ name: 'PhotoUploader' }).props('initialImages')).toEqual([]);
    expect(w.find('[data-test="baseline-summary"]').text()).toContain('사진 0');
  });
});
