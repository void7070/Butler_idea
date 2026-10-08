import { describe, it, expect } from 'vitest';
import { diffBaseline } from '../src/lib/diff.js';
import { ITEM_CATALOG, ZONES } from '../src/domain/itemCatalog.js';

// 스냅샷 모양: items(이상 항목만, item_code), images(item_id | zone), zoneConfirmations(zone, role)
const confirm = (zones, role = 'author') => zones.map((zone) => ({ zone, role }));
const snap = ({ items = [], images = [], zoneConfirmations = [] } = {}) => ({ items, images, zoneConfirmations });
const allZones = confirm(ZONES);

describe('diffBaseline (순수)', () => {
  it('둘 다 7개 구역 확인 + 기록 없음 → 변경 없음, unchangedCount 40', () => {
    const r = diffBaseline(snap({ zoneConfirmations: allZones }), snap({ zoneConfirmations: allZones }), ITEM_CATALOG);
    expect(r.changes).toEqual([]);
    expect(r.unchangedCount).toBe(40);
  });

  it('기록 없는 항목은 구역이 확인됐으면 normal → 퇴거 이상이면 변경', () => {
    const r = diffBaseline(
      snap({ zoneConfirmations: allZones }),
      snap({ items: [{ id: 1, item_code: 'LIVING_FLOORING', state: 'minor' }], zoneConfirmations: allZones }),
      ITEM_CATALOG
    );
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      itemCode: 'LIVING_FLOORING',
      zone: '거실',
      name: '바닥재',
      tier: 'core',
      from: 'normal',
      to: 'minor',
    });
    expect(r.unchangedCount).toBe(39);
  });

  it('같은 상태·나아진 상태는 변경이 아니다', () => {
    const r = diffBaseline(
      snap({
        items: [
          { id: 1, item_code: 'LIVING_FLOORING', state: 'damaged' },
          { id: 2, item_code: 'LIVING_WINDOW', state: 'broken' },
        ],
        zoneConfirmations: allZones,
      }),
      snap({
        items: [
          { id: 3, item_code: 'LIVING_FLOORING', state: 'damaged' },
          { id: 4, item_code: 'LIVING_WINDOW', state: 'minor' },
        ],
        zoneConfirmations: allZones,
      }),
      ITEM_CATALOG
    );
    expect(r.changes).toEqual([]);
  });

  it('입주 때 구역 미확인 + 기록 없음 → unknown, 퇴거 이상이면 변경(evidence low)', () => {
    const moveIn = snap({ zoneConfirmations: confirm(ZONES.filter((z) => z !== '방2'), 'tenant') });
    const r = diffBaseline(
      moveIn,
      snap({ items: [{ id: 1, item_code: 'ROOM2_WALLPAPER', state: 'minor' }], zoneConfirmations: allZones }),
      ITEM_CATALOG
    );
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ itemCode: 'ROOM2_WALLPAPER', from: 'unknown', to: 'minor', evidence: 'low' });
  });

  it('입주 unknown + 퇴거 normal, 퇴거 unknown → 변경이 아니다', () => {
    const r = diffBaseline(snap(), snap({ zoneConfirmations: allZones }), ITEM_CATALOG);
    expect(r.changes).toEqual([]);
    const r2 = diffBaseline(snap({ zoneConfirmations: allZones }), snap(), ITEM_CATALOG);
    expect(r2.changes).toEqual([]);
    expect(r2.unchangedCount).toBe(40);
  });

  it('item_code 없는 옛 항목은 무시한다', () => {
    const r = diffBaseline(
      snap({ zoneConfirmations: allZones }),
      snap({ items: [{ id: 1, item_code: null, name: '누수', state: 'repair' }], zoneConfirmations: allZones }),
      ITEM_CATALOG
    );
    expect(r.changes).toEqual([]);
  });

  describe('evidence 3단계', () => {
    const moveOut = snap({
      items: [{ id: 100, item_code: 'LIVING_FLOORING', state: 'broken' }],
      images: [{ id: 900, item_id: 100, data_base64: 'OUT' }],
      zoneConfirmations: allZones,
    });
    const evidenceOf = (moveIn) => diffBaseline(moveIn, moveOut, ITEM_CATALOG).changes[0];

    it('high: 입주 때 그 항목 사진 있음 (tenant 미확인이어도)', () => {
      const c = evidenceOf(
        snap({
          items: [{ id: 1, item_code: 'LIVING_FLOORING', state: 'minor' }],
          images: [{ id: 10, item_id: 1, data_base64: 'IN' }],
          zoneConfirmations: allZones,
        })
      );
      expect(c.evidence).toBe('high');
      expect(c.moveInImages.map((i) => i.id)).toEqual([10]);
      expect(c.moveOutImages.map((i) => i.id)).toEqual([900]);
    });

    it('high: 구역을 tenant가 확인 + 구역 전경 사진', () => {
      const c = evidenceOf(
        snap({
          images: [{ id: 11, item_id: null, zone: '거실', data_base64: 'OV' }],
          zoneConfirmations: [...allZones, { zone: '거실', role: 'tenant' }],
        })
      );
      expect(c.evidence).toBe('high');
      expect(c.moveInImages).toEqual([]); // 전경 사진은 항목 사진이 아니다
    });

    it('mid: 구역을 tenant가 확인 (사진 없음)', () => {
      const c = evidenceOf(snap({ zoneConfirmations: [...allZones, { zone: '거실', role: 'tenant' }] }));
      expect(c.evidence).toBe('mid');
    });

    it('low: tenant 미확인 (다른 구역 전경 사진·tenant 확인은 상관없음)', () => {
      const c = evidenceOf(
        snap({
          images: [{ id: 12, item_id: null, zone: '주방', data_base64: 'OV' }],
          zoneConfirmations: [...allZones, { zone: '주방', role: 'tenant' }],
        })
      );
      expect(c.evidence).toBe('low');
    });
  });

  it('시연 데이터: 거실 벽지 high · 화장실 실리콘 mid · 주방 후드 필터 high · 베란다 방충망 low → 4개', () => {
    const moveIn = snap({
      items: [{ id: 1, item_code: 'BATHROOM_SILICONE', state: 'minor' }],
      images: [
        { id: 10, item_id: null, zone: '거실', data_base64: 'LIVING' },
        { id: 11, item_id: null, zone: '주방', data_base64: 'KITCHEN' },
      ],
      zoneConfirmations: [...allZones, ...confirm(['거실', '주방', '화장실'], 'tenant')],
    });
    const moveOut = snap({
      items: [
        { id: 21, item_code: 'LIVING_WALLPAPER', state: 'damaged' },
        { id: 22, item_code: 'KITCHEN_HOOD_FILTER', state: 'minor' },
        { id: 23, item_code: 'BATHROOM_SILICONE', state: 'damaged' },
        { id: 24, item_code: 'BALCONY_SCREEN', state: 'damaged' },
      ],
      images: [
        { id: 31, item_id: 21, data_base64: 'W' },
        { id: 32, item_id: 23, data_base64: 'S' },
        { id: 33, item_id: 24, data_base64: 'B' },
      ],
      zoneConfirmations: allZones,
    });

    const r = diffBaseline(moveIn, moveOut, ITEM_CATALOG);
    expect(r.changes.map((c) => [c.itemCode, c.from, c.to, c.evidence])).toEqual([
      ['LIVING_WALLPAPER', 'normal', 'damaged', 'high'],
      ['KITCHEN_HOOD_FILTER', 'normal', 'minor', 'high'],
      ['BATHROOM_SILICONE', 'minor', 'damaged', 'mid'],
      ['BALCONY_SCREEN', 'normal', 'damaged', 'low'],
    ]);
    expect(r.unchangedCount).toBe(36);
    expect(r.changes[0].moveOutImages.map((i) => i.id)).toEqual([31]);
  });
});
