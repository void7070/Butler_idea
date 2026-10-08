import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { ZONES, ITEM_CATALOG, getItem, itemsByZone } from '../src/domain/itemCatalog.js';
import { lifespanYears } from '../src/domain/lifespans.js';

describe('itemCatalog', () => {
  it('40개 항목 = 핵심 25 · 일반 15', () => {
    expect(ITEM_CATALOG).toHaveLength(40);
    expect(ITEM_CATALOG.filter((it) => it.tier === 'core')).toHaveLength(25);
    expect(ITEM_CATALOG.filter((it) => it.tier === 'general')).toHaveLength(15);
  });

  it('코드 중복 없음', () => {
    const codes = ITEM_CATALOG.map((it) => it.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('모든 항목의 구역은 ZONES 안에 있다', () => {
    expect(ZONES).toEqual(['현관', '거실', '주방', '화장실', '방1', '방2', '베란다']);
    for (const it of ITEM_CATALOG) expect(ZONES).toContain(it.zone);
  });

  it('내구연수는 카탈로그에 없고 lifespans.js에서 이름으로 찾는다 (모든 항목 양수)', () => {
    for (const it of ITEM_CATALOG) {
      expect(it).not.toHaveProperty('durabilityYears');
      expect(lifespanYears(it.name)).toBeGreaterThan(0);
    }
  });

  it('getItem은 코드로 찾고, 없으면 null', () => {
    expect(getItem('LIVING_WALLPAPER')).toMatchObject({ zone: '거실', name: '벽지', tier: 'core' });
    expect(getItem('NOPE')).toBeNull();
  });

  it('itemsByZone은 ZONES 순서로 묶는다', () => {
    const groups = itemsByZone();
    expect(groups.map((g) => g.zone)).toEqual(ZONES);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(40);
    expect(groups.find((g) => g.zone === '방1').items).toHaveLength(7);
  });
});

describe('GET /api/item-catalog', () => {
  let app;
  beforeEach(() => {
    const db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}' });
  });

  it('인증 없이 카탈로그를 반환한다', async () => {
    const res = await request(app).get('/api/item-catalog');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.zones).toEqual(ZONES);
    expect(res.body.data.items).toHaveLength(40);
  });
});

describe('inspection_items.item_code', () => {
  it('item_code를 저장하고, 없으면 NULL', async () => {
    const db = createDb(':memory:');
    applySchema(db);
    seed(db);
    const { createInspection } = await import('../src/repositories/inspectionRepo.js');
    const insp = createInspection(db, {
      unitId: db.prepare('SELECT id FROM units LIMIT 1').get().id,
      createdBy: db.prepare("SELECT id FROM users WHERE role='contractor'").get().id,
      type: 'move_in',
      items: [{ itemCode: 'LIVING_WALLPAPER', category: '거실', name: '벽지', state: 'normal' }, { name: '옛 항목' }],
    });
    expect(insp.items.map((i) => i.item_code)).toEqual(['LIVING_WALLPAPER', null]);
  });
});
