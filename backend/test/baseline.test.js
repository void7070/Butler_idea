import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { computeBaselineGrade, computeGrade } from '../src/lib/grading.js';
import { normalizeBaselineInput, normalizeZones } from '../src/lib/baseline.js';
import { flowForType } from '../src/domain/inspectionTypes.js';
import { ZONES } from '../src/domain/itemCatalog.js';

const s = (...states) => states.map((state) => ({ state }));

describe('flowForType', () => {
  it('입주 전·퇴거 전·퇴거 후는 baseline, 나머지는 기존 흐름', () => {
    expect(flowForType('move_in')).toBe('baseline');
    expect(flowForType('move_out_pre')).toBe('baseline');
    expect(flowForType('move_out_post')).toBe('baseline');
    expect(flowForType('periodic')).toBe('whole');
    expect(flowForType('emergency')).toBe('issue');
    expect(flowForType('repair_pre')).toBe('issue');
  });
});

describe('computeBaselineGrade 경계값', () => {
  it('A: 이상 없음', () => expect(computeBaselineGrade([])).toBe('A'));
  it('B: 경미만', () => expect(computeBaselineGrade(s('minor', 'minor', 'minor'))).toBe('B'));
  it('C: 손상 1~2', () => {
    expect(computeBaselineGrade(s('damaged'))).toBe('C');
    expect(computeBaselineGrade(s('damaged', 'damaged', 'minor'))).toBe('C');
  });
  it('D: 손상 3 또는 파손 1', () => {
    expect(computeBaselineGrade(s('damaged', 'damaged', 'damaged'))).toBe('D');
    expect(computeBaselineGrade(s('broken'))).toBe('D');
    expect(computeBaselineGrade(s('broken', 'damaged', 'damaged', 'damaged'))).toBe('D');
  });
  it('E: 파손 2+', () => expect(computeBaselineGrade(s('broken', 'broken'))).toBe('E'));
  it('computeGrade가 baseline으로 디스패치', () => expect(computeGrade('baseline', s('minor'))).toBe('B'));
});

describe('normalizeBaselineInput', () => {
  it('정상 항목은 버리고, 구역·이름은 카탈로그로 채우고, itemIndex를 다시 맞춘다', () => {
    const out = normalizeBaselineInput({
      items: [
        { itemCode: 'LIVING_WALLPAPER' }, // 기본 정상 → 제외
        { itemCode: 'BATHROOM_SILICONE', state: 'minor', category: '엉뚱', name: '엉뚱' },
      ],
      images: [
        { dataBase64: 'AAAA', itemIndex: 1 },
        { dataBase64: 'AAAA', itemIndex: 0 }, // 정상 항목 사진 → 연결 해제
        { dataBase64: 'AAAA', itemCode: 'BATHROOM_SILICONE' },
        { dataBase64: 'AAAA', zone: '거실' },
      ],
    });
    expect(out.items).toEqual([
      {
        itemCode: 'BATHROOM_SILICONE',
        category: '화장실',
        name: '실리콘',
        state: 'minor',
        location: null,
        description: null,
      },
    ]);
    expect(out.images.map((i) => i.itemIndex)).toEqual([0, null, 0, null]);
    expect(out.images[3].zone).toBe('거실');
  });

  it('items 없이 사진만 오면 저장된 항목에서 itemCode를 찾는다', () => {
    const out = normalizeBaselineInput(
      { images: [{ dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' }] },
      [{ item_code: 'KITCHEN_HOOD_FILTER' }, { item_code: 'LIVING_WALLPAPER' }]
    );
    expect(out.items).toBeUndefined();
    expect(out.images[0].itemIndex).toBe(1);
  });

  it('잘못된 코드·상태·중복·구역은 400', () => {
    const code = (fn) => {
      try {
        fn();
      } catch (e) {
        return e.code;
      }
      return null;
    };
    expect(code(() => normalizeBaselineInput({ items: [{ itemCode: 'NOPE', state: 'minor' }] }))).toBe(
      'INVALID_ITEM_CODE'
    );
    expect(code(() => normalizeBaselineInput({ items: [{ itemCode: 'LIVING_WALLPAPER', state: 'caution' }] }))).toBe(
      'INVALID_STATE'
    );
    expect(
      code(() =>
        normalizeBaselineInput({ items: [{ itemCode: 'LIVING_WALLPAPER' }, { itemCode: 'LIVING_WALLPAPER' }] })
      )
    ).toBe('DUPLICATE_ITEM_CODE');
    expect(code(() => normalizeZones(['욕실']))).toBe('INVALID_ZONE');
  });

  it('normalizeZones는 중복을 합치고 ZONES 순서로 정렬', () => {
    expect(normalizeZones(['주방', '현관', '주방'])).toEqual(['현관', '주방']);
  });
});

describe('baseline 점검 API', () => {
  let app;
  let db;
  let contractor;
  let unit;

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db);
    contractor = db.prepare("SELECT id FROM users WHERE role='contractor'").get().id;
    unit = db.prepare("SELECT id FROM units WHERE name='1234호'").get().id;
  });

  const as = (req) => req.set('x-user-id', String(contractor));
  const create = (body) => as(request(app).post('/api/inspections')).send({ unitId: unit, ...body });
  const submit = (id) => as(request(app).post(`/api/inspections/${id}/submit`));
  const snapshotOf = (reportId) =>
    JSON.parse(db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(reportId).snapshot_json);

  it('생성: flow=baseline, 이상 항목만 item_code와 함께 저장, 구역 확인은 author로 저장', async () => {
    const res = await create({
      type: 'move_out_pre',
      items: [
        { itemCode: 'LIVING_WALLPAPER', state: 'damaged' },
        { itemCode: 'LIVING_FLOORING', state: 'normal' },
        { itemCode: 'KITCHEN_HOOD_FILTER', state: 'minor' },
      ],
      zonesConfirmed: ['현관', '거실'],
    });
    expect(res.status).toBe(201);
    const insp = res.body.data.inspection;
    expect(insp.flow).toBe('baseline');
    expect(insp.items.map((i) => [i.item_code, i.category, i.state])).toEqual([
      ['LIVING_WALLPAPER', '거실', 'damaged'],
      ['KITCHEN_HOOD_FILTER', '주방', 'minor'],
    ]);
    expect(insp.zoneConfirmations.map((z) => [z.zone, z.role])).toEqual([
      ['현관', 'author'],
      ['거실', 'author'],
    ]);
  });

  it('잘못된 항목 코드면 400 INVALID_ITEM_CODE', async () => {
    const res = await create({ type: 'move_in', items: [{ itemCode: 'NOPE', state: 'minor' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ITEM_CODE');
  });

  it('수정: zonesConfirmed만 보내면 항목은 보존되고 구역 확인만 교체', async () => {
    const created = await create({
      type: 'move_in',
      items: [{ itemCode: 'BATHROOM_SILICONE', state: 'minor' }],
      zonesConfirmed: ['현관'],
    });
    const id = created.body.data.inspection.id;
    const res = await as(request(app).patch(`/api/inspections/${id}`)).send({ zonesConfirmed: ['거실', '주방'] });
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.items).toHaveLength(1);
    expect(res.body.data.inspection.zoneConfirmations.map((z) => z.zone)).toEqual(['거실', '주방']);
  });

  it('수정: 사진만 보내도 itemCode로 저장된 항목에 연결', async () => {
    const created = await create({ type: 'move_in', items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged' }] });
    const insp = created.body.data.inspection;
    const res = await as(request(app).patch(`/api/inspections/${insp.id}`)).send({
      images: [{ dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' }, { dataBase64: 'AAAA', zone: '거실', kind: '전경' }],
    });
    expect(res.status).toBe(200);
    const imgs = res.body.data.inspection.images;
    expect(imgs[0].item_id).toBe(insp.items[0].id);
    expect(imgs[1]).toMatchObject({ item_id: null, zone: '거실' });
  });

  it('수정: 항목만 다시 보내도 사진은 같은 itemCode 항목에 남고, 정상이 된 항목 사진은 연결만 풀린다', async () => {
    const created = await create({
      type: 'move_in',
      items: [
        { itemCode: 'LIVING_WALLPAPER', state: 'damaged' },
        { itemCode: 'KITCHEN_COUNTERTOP', state: 'minor' },
      ],
      images: [
        { dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' },
        { dataBase64: 'AAAA', itemCode: 'KITCHEN_COUNTERTOP' },
      ],
    });
    const id = created.body.data.inspection.id;
    const res = await as(request(app).patch(`/api/inspections/${id}`)).send({
      items: [
        { itemCode: 'LIVING_WALLPAPER', state: 'broken', description: '수정' },
        { itemCode: 'KITCHEN_COUNTERTOP', state: 'normal' },
      ],
    });
    expect(res.status).toBe(200);
    const { items, images } = res.body.data.inspection;
    expect(items.map((i) => i.item_code)).toEqual(['LIVING_WALLPAPER']);
    expect(images.map((img) => img.item_id)).toEqual([items[0].id, null]);
  });

  it('제출: 사진을 넣은 뒤 항목만 수정해도 PHOTO_REQUIRED가 나지 않는다', async () => {
    const created = await create({
      type: 'move_in',
      items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged' }],
      images: [{ dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' }],
      zonesConfirmed: ['현관', '주방', '화장실', '방1', '방2', '베란다'],
    });
    const id = created.body.data.inspection.id;
    await as(request(app).patch(`/api/inspections/${id}`)).send({
      items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged', description: '설명 추가' }],
    });
    const res = await submit(id);
    expect(res.status).toBe(201);
  });

  it('제출: 확인 안 된 구역이 있으면 400 ZONES_NOT_CONFIRMED', async () => {
    const created = await create({ type: 'move_in', zonesConfirmed: ['현관', '거실'] });
    const res = await submit(created.body.data.inspection.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ZONES_NOT_CONFIRMED');
    expect(res.body.error.message).toContain('주방');
  });

  it('제출: 이상 항목이 있는 구역은 확인하지 않아도 된다', async () => {
    const created = await create({
      type: 'move_in',
      items: [{ itemCode: 'KITCHEN_HOOD_FILTER', state: 'minor' }], // 일반 항목 → 사진 불필요
      zonesConfirmed: ZONES.filter((z) => z !== '주방'),
    });
    const res = await submit(created.body.data.inspection.id);
    expect(res.status).toBe(201);
  });

  it('제출: 핵심 항목 이상인데 사진이 없으면 400 PHOTO_REQUIRED, 사진을 넣으면 통과', async () => {
    const created = await create({
      type: 'move_out_post',
      items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged' }],
      zonesConfirmed: ZONES,
    });
    const id = created.body.data.inspection.id;

    const bad = await submit(id);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('PHOTO_REQUIRED');
    expect(bad.body.error.message).toContain('거실 벽지');

    await as(request(app).patch(`/api/inspections/${id}`)).send({
      images: [{ dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' }],
    });
    const ok = await submit(id);
    expect(ok.status).toBe(201);
  });

  it('제출: 등급과 스냅샷(item_code, zoneConfirmations, 구역 사진)', async () => {
    const created = await create({
      type: 'move_in',
      items: [
        { itemCode: 'LIVING_WALLPAPER', state: 'damaged' },
        { itemCode: 'BATHROOM_SILICONE', state: 'minor' },
      ],
      images: [
        { dataBase64: 'AAAA', itemIndex: 0 },
        { dataBase64: 'AAAA', itemIndex: 1 },
        { dataBase64: 'AAAA', zone: '거실', kind: '전경' },
      ],
      zonesConfirmed: ZONES,
    });
    const res = await submit(created.body.data.inspection.id);
    expect(res.status).toBe(201);
    const reportId = res.body.data.reportId;

    expect(db.prepare('SELECT grade, flow FROM reports WHERE id = ?').get(reportId)).toEqual({
      grade: 'C',
      flow: 'baseline',
    });
    const snap = snapshotOf(reportId);
    expect(snap.inspection.flow).toBe('baseline');
    expect(snap.items.map((i) => i.item_code)).toEqual(['LIVING_WALLPAPER', 'BATHROOM_SILICONE']);
    expect(snap.zoneConfirmations.map((z) => z.zone)).toEqual(ZONES);
    expect(snap.images.find((i) => i.zone === '거실')).toBeTruthy();
  });

  it('기존 whole/issue 점검 제출에는 baseline 검증이 걸리지 않는다', async () => {
    const created = await create({ type: 'periodic', items: [{ category: '거실', name: '창호', state: 'caution' }] });
    const res = await submit(created.body.data.inspection.id);
    expect(res.status).toBe(201);
  });
});

describe('seed', () => {
  it('345호 입주 전 리포트는 baseline A등급, 7개 구역 확인', () => {
    const db = createDb(':memory:');
    applySchema(db);
    seed(db);
    const r = db
      .prepare("SELECT r.id, r.flow, r.grade FROM reports r JOIN units u ON u.id = r.unit_id WHERE r.type='move_in' AND u.name='345호'")
      .get();
    expect(r).toMatchObject({ flow: 'baseline', grade: 'A' });
    const snap = JSON.parse(
      db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(r.id).snapshot_json
    );
    expect(snap.zoneConfirmations).toHaveLength(7);
  });
});
