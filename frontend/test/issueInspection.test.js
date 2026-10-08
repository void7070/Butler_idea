import { describe, it, expect } from 'vitest';
import {
  newIssueItem,
  fromInspection,
  buildSavePayload,
  isRepairType,
  splitImages,
  buildImagesPayload,
  repairPhotoSummary,
  repairPreOptions,
} from '../src/lib/issueInspection.js';

describe('newIssueItem', () => {
  it('기본 심각도 minor, 관찰 빈 배열', () => {
    const it = newIssueItem();
    expect(it.state).toBe('minor');
    expect(it.observations).toEqual([]);
  });
});

describe('fromInspection', () => {
  it('observations를 item_id로 묶어 중첩 모델 복원', () => {
    const items = [
      { id: 10, category: '설비·배관', name: '누수', state: 'repair', location: '주방', description: '천장' },
      { id: 11, category: '전기', name: '콘센트 불량', state: 'check' },
    ];
    const observations = [
      { item_id: 10, label: '곰팡이', value: 'present' },
      { item_id: 11, label: '스파크', value: 'uncertain' },
    ];
    const form = fromInspection(items, observations);
    expect(form).toHaveLength(2);
    expect(form[0].observations).toEqual([{ label: '곰팡이', value: 'present' }]);
    expect(form[1].name).toBe('콘센트 불량');
  });
});

describe('buildSavePayload', () => {
  it('items 평탄화 + observations에 itemIndex 부여', () => {
    const form = [
      {
        category: '설비·배관',
        name: '누수',
        state: 'repair',
        location: '주방',
        description: '천장',
        observations: [{ label: '곰팡이', value: 'present' }],
      },
      { category: '전기', name: '콘센트 불량', state: 'check', location: '', description: '', observations: [] },
    ];
    const payload = buildSavePayload(form);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).not.toHaveProperty('observations');
    expect(payload.observations).toEqual([{ itemIndex: 0, label: '곰팡이', value: 'present' }]);
  });

  it('라벨 없는 관찰 항목은 제외', () => {
    const form = [{ category: '전기', name: '조명', state: 'minor', observations: [{ label: '', value: 'present' }] }];
    expect(buildSavePayload(form).observations).toEqual([]);
  });

  it('fromInspection → buildSavePayload 라운드트립', () => {
    const items = [{ id: 1, category: 'A', name: 'a', state: 'repair', location: 'L', description: 'D' }];
    const observations = [{ item_id: 1, label: 'obs', value: 'absent' }];
    const payload = buildSavePayload(fromInspection(items, observations));
    expect(payload.observations).toEqual([{ itemIndex: 0, label: 'obs', value: 'absent' }]);
  });
});

describe('수리 전·후 사진 필수 (창 26)', () => {
  it('isRepairType: 수리 전·후만', () => {
    expect(isRepairType('repair_pre')).toBe(true);
    expect(isRepairType('repair_post')).toBe(true);
    expect(isRepairType('emergency')).toBe(false);
  });

  it('splitImages: item_id로 항목 순서에 나누고 나머지는 extra', () => {
    const items = [{ id: 7 }, { id: 9 }];
    const images = [
      { item_id: 9, data_base64: 'b', kind: '근접', caption: '' },
      { item_id: null, data_base64: 'x' },
      { item_id: 7, data_base64: 'a' },
    ];
    const { photos, extraImages } = splitImages(items, images);
    expect(photos.map((p) => p.map((i) => i.dataBase64))).toEqual([['a'], ['b']]);
    expect(extraImages.map((i) => i.dataBase64)).toEqual(['x']);
  });

  it('buildImagesPayload: itemIndex 부여 + extra는 연결 없이', () => {
    const payload = buildImagesPayload([[{ dataBase64: 'a', kind: '', caption: '' }], []], [{ dataBase64: 'x', kind: '', caption: '' }]);
    expect(payload).toEqual([
      { itemIndex: 0, dataBase64: 'a', kind: '', caption: '' },
      { dataBase64: 'x', kind: '', caption: '' },
    ]);
  });

  it('repairPhotoSummary: 사진 없는 항목 개수·번호, 모두 있음, 항목 없음', () => {
    expect(repairPhotoSummary([[{}], [], []])).toEqual({ missing: [2, 3], ok: false, text: '사진 없는 항목 2개 (문제 항목 2, 3)' });
    expect(repairPhotoSummary([[{}]]).ok).toBe(true);
    expect(repairPhotoSummary([[{}]]).text).toBe('모든 항목에 사진이 있습니다.');
    expect(repairPhotoSummary([]).ok).toBe(false);
  });

  it('repairPreOptions: 같은 호실 수리 전 리포트만, 최신순', () => {
    const reports = [
      { id: 1, type: 'repair_pre', unitId: 2, createdAt: '2026-10-01 10:00:00' },
      { id: 2, type: 'repair_pre', unitId: 1, createdAt: '2026-10-02 10:00:00' },
      { id: 3, type: 'emergency', unitId: 2, createdAt: '2026-10-03 10:00:00' },
      { id: 4, type: 'repair_pre', unitId: 2, createdAt: '2026-10-04 10:00:00' },
    ];
    expect(repairPreOptions(reports, 2)).toEqual([
      { id: 4, label: '수리 전 점검 리포트 #4 · 2026-10-04' },
      { id: 1, label: '수리 전 점검 리포트 #1 · 2026-10-01' },
    ]);
  });
});
