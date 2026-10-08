import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { ZONES } from '../src/domain/itemCatalog.js';
import { hashSnapshot } from '../src/lib/snapshotHash.js';
import {
  buildCarryover,
  latestMoveOutReport,
  normalizeCarryoverInput,
  REASON_REPAIR_CHECK,
  REASON_INHERIT,
} from '../src/lib/carryover.js';

const MOVE_OUT_SNAPSHOT = {
  items: [
    { id: 11, item_code: 'LIVING_WALLPAPER', state: 'damaged', description: '찢김' },
    { id: 12, item_code: 'BATHROOM_SILICONE', state: 'damaged' },
    { id: 13, item_code: 'ROOM1_DOOR', state: 'minor' }, // 입주 때도 경미 → 정산에 없음
    { id: 14, item_code: 'KITCHEN_HOOD_FILTER', state: 'normal' },
    { id: 15, category: '거실', name: '창호', state: 'caution' }, // 옛 흐름 항목(코드 없음)
  ],
  images: [
    { id: 1, item_id: 11, caption: '벽지', data_base64: 'data:a' },
    { id: 2, item_id: null, zone: '거실', data_base64: 'data:zone' },
  ],
};
const SOURCE = { id: 5, created_at: '2026-03-02 10:00:00' };
const SETTLEMENT_ITEMS = [
  { itemCode: 'LIVING_WALLPAPER', payer: 'tenant' },
  { itemCode: 'BATHROOM_SILICONE', payer: 'landlord' },
];

describe('carryover (순수)', () => {
  it('확정 전 정산: 모든 이상 항목이 퇴거 상태 그대로, 카탈로그 순서, 정상·코드 없는 항목 제외', () => {
    const out = buildCarryover({
      sourceReport: SOURCE,
      moveOutSnapshot: MOVE_OUT_SNAPSHOT,
      settlement: { id: 1, status: 'hold', items: SETTLEMENT_ITEMS },
    });
    expect(out).toMatchObject({ sourceReportId: 5, sourceDate: '2026-03-02', settlementId: 1 });
    expect(out.items.map((it) => it.itemCode)).toEqual(['LIVING_WALLPAPER', 'BATHROOM_SILICONE', 'ROOM1_DOOR']);
    const wall = out.items[0];
    expect(wall).toMatchObject({
      zone: '거실',
      name: '벽지',
      tier: 'core',
      state: 'damaged',
      inSettlement: true,
      settlementStatus: 'hold',
      payer: 'tenant',
      suggestedState: 'damaged',
      needsRepairCheck: false,
      reason: REASON_INHERIT,
    });
    expect(wall.moveOutImages).toEqual([{ caption: '벽지', data_base64: 'data:a' }]);
  });

  it('확정 정산: 정산 항목은 부담자와 무관하게 정상 + 수리 확인 필요, 정산 밖 항목은 이어받음', () => {
    const out = buildCarryover({
      sourceReport: SOURCE,
      moveOutSnapshot: MOVE_OUT_SNAPSHOT,
      settlement: { id: 1, status: 'confirmed', items: SETTLEMENT_ITEMS },
    });
    const byCode = Object.fromEntries(out.items.map((it) => [it.itemCode, it]));
    for (const code of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      expect(byCode[code]).toMatchObject({ suggestedState: 'normal', needsRepairCheck: true, reason: REASON_REPAIR_CHECK });
    }
    expect(byCode.BATHROOM_SILICONE.payer).toBe('landlord');
    expect(byCode.ROOM1_DOOR).toMatchObject({
      inSettlement: false,
      settlementStatus: null,
      payer: null,
      suggestedState: 'minor',
      reason: REASON_INHERIT,
    });
  });

  it('정산이 없으면 모두 이어받음, latestMoveOutReport는 퇴거 전/후 중 가장 최근', () => {
    const out = buildCarryover({ sourceReport: SOURCE, moveOutSnapshot: MOVE_OUT_SNAPSHOT, settlement: null });
    expect(out.settlementId).toBeNull();
    expect(out.items.every((it) => it.suggestedState === it.state && !it.inSettlement)).toBe(true);

    const reports = [
      { id: 1, type: 'move_out_post', created_at: '2025-01-01 10:00:00' },
      { id: 2, type: 'move_in', created_at: '2026-05-01 10:00:00' },
      { id: 3, type: 'move_out_pre', created_at: '2026-03-01 10:00:00' },
    ];
    expect(latestMoveOutReport(reports).id).toBe(3);
    expect(latestMoveOutReport([{ id: 2, type: 'move_in', created_at: 'x' }])).toBeNull();
  });

  it('normalizeCarryoverInput: 코드 검증, 중복 제거, null은 지우기', () => {
    expect(normalizeCarryoverInput(null)).toBeNull();
    expect(
      normalizeCarryoverInput({
        sourceReportId: '5',
        items: [
          { itemCode: 'LIVING_WALLPAPER', reason: REASON_REPAIR_CHECK, repairCheckPending: true },
          { itemCode: 'LIVING_WALLPAPER' },
        ],
      })
    ).toEqual({
      sourceReportId: 5,
      items: [{ itemCode: 'LIVING_WALLPAPER', reason: REASON_REPAIR_CHECK, repairCheckPending: true }],
    });
    expect(() => normalizeCarryoverInput({ sourceReportId: 5, items: [{ itemCode: 'NOPE' }] })).toThrow();
    expect(() => normalizeCarryoverInput({ items: [] })).toThrow();
  });
});

describe('GET /api/units/:id/baseline-carryover · 입주 스냅샷 기록 (창 20)', () => {
  let db, app, ids, units, settlementId;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const NOW = '2026-09-27T05:00:00.000Z';
  const carryover = (uid, unitId = units['1234호']) =>
    request(app).get(`/api/units/${unitId}/baseline-carryover`).set(as(uid));

  async function confirmDemo() {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    const token = (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response: 'agree' });
    }
    const res = await request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner));
    expect(res.status).toBe(200);
  }

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(NOW) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    units = Object.fromEntries(db.prepare('SELECT id, name FROM units').all().map((u) => [u.name, u.id]));
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
  });

  it('확정 전: 1234호 퇴거 리포트의 4개 항목이 퇴거 상태 그대로', async () => {
    const res = await carryover(ids.contractor);
    expect(res.status).toBe(200);
    const moveOutId = db.prepare("SELECT id FROM reports WHERE type = 'move_out_post'").get().id;
    expect(res.body.data).toMatchObject({ sourceReportId: moveOutId, sourceDate: '2026-03-02' });
    const items = res.body.data.items;
    expect(items).toHaveLength(4);
    expect(items.every((it) => it.inSettlement && it.settlementStatus === 'draft')).toBe(true);
    expect(items.every((it) => it.suggestedState === it.state && it.reason === REASON_INHERIT)).toBe(true);
    expect(items.find((it) => it.itemCode === 'LIVING_WALLPAPER').moveOutImages).toHaveLength(1);
  });

  it('확정 후: 정산 항목 모두(임차인·임대인 부담) 정상 + 수리 확인 필요', async () => {
    await confirmDemo();
    const items = (await carryover(ids.owner)).body.data.items;
    expect(items).toHaveLength(4);
    expect(items.every((it) => it.suggestedState === 'normal' && it.reason === REASON_REPAIR_CHECK)).toBe(true);
    expect(items.every((it) => it.settlementStatus === 'confirmed')).toBe(true);
    const payers = Object.fromEntries(items.map((it) => [it.itemCode, it.payer]));
    expect(payers).toEqual({
      LIVING_WALLPAPER: 'tenant',
      BATHROOM_SILICONE: 'tenant',
      KITCHEN_HOOD_FILTER: 'landlord',
      BALCONY_SCREEN: 'landlord',
    });
  });

  it('퇴거 리포트가 없으면 404 NO_PREVIOUS_MOVE_OUT, 권한: 임차인 403 · 헤더 없음 401 · 없는 호실 404', async () => {
    const none = await carryover(ids.owner, units['345호']);
    expect(none.status).toBe(404);
    expect(none.body.error.code).toBe('NO_PREVIOUS_MOVE_OUT');
    expect((await carryover(ids.tenant)).status).toBe(403);
    expect((await request(app).get(`/api/units/${units['1234호']}/baseline-carryover`)).status).toBe(401);
    expect((await carryover(ids.contractor, 9999)).status).toBe(404);
  });

  it('다른 호실 owner는 403', async () => {
    const other = db
      .prepare("INSERT INTO users (name, role) VALUES ('남임대', 'owner')")
      .run().lastInsertRowid;
    expect((await carryover(other)).status).toBe(403);
  });

  it('입주 전 점검에 carryover 저장 → 제출하면 스냅샷(해시 포함)에 남고 House Log에 이벤트', async () => {
    await confirmDemo();
    const source = (await carryover(ids.contractor)).body.data;
    const created = await request(app)
      .post('/api/inspections')
      .set(as(ids.contractor))
      .send({ unitId: units['1234호'], type: 'move_in' });
    const inspId = created.body.data.inspection.id;

    const body = {
      sourceReportId: source.sourceReportId,
      items: source.items.map((it, i) => ({ itemCode: it.itemCode, reason: it.reason, repairCheckPending: i === 0 })),
    };
    const patched = await request(app)
      .patch(`/api/inspections/${inspId}`)
      .set(as(ids.contractor))
      .send({ zonesConfirmed: ZONES, carryover: body });
    expect(patched.status).toBe(200);
    expect(patched.body.data.inspection.carryover.items).toHaveLength(4);

    const submit = await request(app).post(`/api/inspections/${inspId}/submit`).set(as(ids.contractor));
    expect(submit.status).toBe(201);
    const row = db.prepare('SELECT * FROM report_snapshots WHERE report_id = ?').get(submit.body.data.reportId);
    expect(row.snapshot_hash).toBe(hashSnapshot(row.snapshot_json));
    const snap = JSON.parse(row.snapshot_json);
    expect(snap.carryover).toEqual(body);

    const log = (await request(app).get(`/api/units/${units['1234호']}/house-log`).set(as(ids.owner))).body.data;
    const ev = log.events.find((e) => e.kind === 'carryover');
    expect(ev).toMatchObject({ title: '이전 퇴거 기록 이어받음', link: `/owner/reports/${source.sourceReportId}` });
    expect(ev.detail).toBe(`퇴거 리포트 #${source.sourceReportId}에서 4개 가져옴 · 수리 확인 4개 · 현장 확인 전 제출 1개`);
    // 같은 시각의 리포트 발행 바로 뒤
    const idx = log.events.indexOf(ev);
    expect(log.events[idx - 1]).toMatchObject({ kind: 'report', title: '입주 전 점검 리포트 발행' });

    // 기존 입주 리포트 스냅샷은 그대로 (carryover 키 없음)
    const oldMoveIn = db.prepare("SELECT id FROM reports WHERE type = 'move_in' AND unit_id = ? ORDER BY id LIMIT 1").get(units['1234호']).id;
    const oldSnap = JSON.parse(db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(oldMoveIn).snapshot_json);
    expect(oldSnap.carryover).toBeUndefined();
  });

  it('carryover는 입주 전 점검 · 같은 호실 퇴거 리포트만 (400)', async () => {
    const source = (await carryover(ids.contractor)).body.data;
    const moveOut = await request(app)
      .post('/api/inspections')
      .set(as(ids.contractor))
      .send({ unitId: units['1234호'], type: 'move_out_pre' });
    const r1 = await request(app)
      .patch(`/api/inspections/${moveOut.body.data.inspection.id}`)
      .set(as(ids.contractor))
      .send({ carryover: { sourceReportId: source.sourceReportId, items: [] } });
    expect(r1.body.error.code).toBe('CARRYOVER_NOT_MOVE_IN');

    const moveIn345 = await request(app)
      .post('/api/inspections')
      .set(as(ids.contractor))
      .send({ unitId: units['345호'], type: 'move_in' });
    const r2 = await request(app)
      .patch(`/api/inspections/${moveIn345.body.data.inspection.id}`)
      .set(as(ids.contractor))
      .send({ carryover: { sourceReportId: source.sourceReportId, items: [] } });
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe('INVALID_CARRYOVER');
  });
});
