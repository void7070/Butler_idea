import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import {
  computeSettlement,
  applySmallBulk,
  defaultPayer,
  monthsBetween,
  round100,
} from '../src/lib/settlement.js';
import { lifespanYears, DEFAULT_LIFESPAN_YEARS } from '../src/domain/lifespans.js';
import { buildClause, clauseApplyMode } from '../src/domain/clauseTemplates.js';
import { ZONES } from '../src/domain/itemCatalog.js';

// 시연 기준 데이터 (progress.md 표)
const DEMO_CHANGES = [
  { itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high' },
  { itemCode: 'BATHROOM_SILICONE', zone: '화장실', name: '실리콘', tier: 'core', from: 'minor', to: 'damaged', evidence: 'mid' },
  { itemCode: 'KITCHEN_HOOD_FILTER', zone: '주방', name: '후드 필터', tier: 'general', from: 'normal', to: 'minor', evidence: 'high' },
  { itemCode: 'BALCONY_SCREEN', zone: '베란다', name: '방충망', tier: 'core', from: 'normal', to: 'damaged', evidence: 'low' },
];
const DEMO_COSTS = {
  LIVING_WALLPAPER: 480000,
  BATHROOM_SILICONE: 150000, // 표준 잔존 60% → 90,000
  KITCHEN_HOOD_FILTER: 60000,
  BALCONY_SCREEN: 45000,
};

const clause = (clauseNo, templateCode, params) => {
  if (!templateCode) return { clauseNo, text: '그 밖의 파손은 임대인과 임차인이 협의하여 정한다.', templateCode: null, applyMode: 'manual', rule: null };
  const built = buildClause(templateCode, params);
  return { clauseNo, templateCode, templateTitle: null, applyMode: clauseApplyMode(templateCode), text: built.text, rule: built.rule };
};
const DEMO_LEASE = {
  deposit: 50000000,
  startDate: '2024-03-02',
  clauses: [clause(3, 'WALLPAPER_FLOOR_FULL'), clause(4, 'CLEANING_FEE'), clause(6, null)],
};
const withCosts = (payers = {}) =>
  Object.fromEntries(Object.entries(DEMO_COSTS).map(([code, estimateCost]) => [code, { estimateCost, payer: payers[code] }]));

describe('lifespans', () => {
  it('예시 내구연수, 표에 없으면 기본 5년', () => {
    expect(lifespanYears('벽지')).toBe(6);
    expect(lifespanYears('실리콘')).toBe(5);
    expect(lifespanYears('후드 필터')).toBe(8);
    expect(lifespanYears('방충망')).toBe(5);
    expect(lifespanYears('바닥재')).toBe(8);
    expect(lifespanYears('현관문')).toBe(DEFAULT_LIFESPAN_YEARS);
    expect(DEFAULT_LIFESPAN_YEARS).toBe(5);
  });
});

describe('settlement 순수 함수', () => {
  it('monthsBetween: 만 개월, 날짜가 모자라면 한 달 빼고, 음수는 0', () => {
    expect(monthsBetween('2024-03-02', '2026-03-02')).toBe(24);
    expect(monthsBetween('2024-03-02', '2026-03-01 23:00:00')).toBe(23);
    expect(monthsBetween('2026-03-02', '2024-03-02')).toBe(0);
  });

  it('round100: 100원 단위 반올림', () => {
    expect(round100(12349)).toBe(12300);
    expect(round100(12350)).toBe(12400);
  });

  it('기본 부담자: low → hold / 퇴거 minor → landlord / 그 외 tenant', () => {
    expect(DEMO_CHANGES.map(defaultPayer)).toEqual(['tenant', 'tenant', 'landlord', 'hold']);
    expect(defaultPayer({ evidence: 'low', to: 'minor' })).toBe('hold');
  });

  it('시연 기준: 소액 일괄 전 — 방충망은 보류', () => {
    const r = computeSettlement({
      changes: DEMO_CHANGES,
      lease: DEMO_LEASE,
      items: withCosts(),
      moveInDate: '2024-03-02',
      moveOutDate: '2026-03-02',
    });
    expect(r.elapsedMonths).toBe(24);
    const [wall, sil, hood, screen] = r.items;

    expect(wall).toMatchObject({ payer: 'tenant', tenantAmount: 480000, lifespanYears: 6 });
    expect(wall.basis).toEqual({ type: 'clause', clauseNo: 3, stdAmount: 320000, residual: 0.6667 });
    expect(sil).toMatchObject({ payer: 'tenant', tenantAmount: 90000 });
    expect(sil.basis).toEqual({ type: 'standard', clauseNo: null, stdAmount: 90000, residual: 0.6 });
    expect(hood).toMatchObject({ payer: 'landlord', defaultPayer: 'landlord', tenantAmount: 0, landlordAmount: 60000, basis: null });
    expect(screen).toMatchObject({ payer: 'hold', holdAmount: 45000, tenantAmount: 0, landlordAmount: 0 });

    expect(r.fees).toEqual([
      expect.objectContaining({ clauseNo: 4, templateCode: 'CLEANING_FEE', payer: 'tenant', amount: 200000 }),
    ]);
    expect(r.manualClauses).toEqual([{ clauseNo: 6, text: '그 밖의 파손은 임대인과 임차인이 협의하여 정한다.' }]);
    expect(r.totals).toEqual({
      tenantTotal: 770000,
      landlordTotal: 60000,
      holdTotal: 45000,
      deposit: 50000000,
      depositReturn: 49230000,
    });
  });

  it('시연 기준: 소액 일괄 후 — 임차인 770,000 · 임대인 105,000 · 반환 49,230,000', () => {
    const base = DEMO_CHANGES.map((ch) => ({ itemCode: ch.itemCode, estimateCost: DEMO_COSTS[ch.itemCode], payer: defaultPayer(ch) }));
    const bulk = applySmallBulk(base);
    expect(bulk.map((it) => it.payer)).toEqual(['tenant', 'tenant', 'landlord', 'landlord']);
    expect(base[3].payer).toBe('hold'); // 입력은 바꾸지 않는다

    const r = computeSettlement({
      changes: DEMO_CHANGES,
      lease: DEMO_LEASE,
      items: Object.fromEntries(bulk.map((it) => [it.itemCode, it])),
      moveInDate: '2024-03-02',
      moveOutDate: '2026-03-02',
    });
    expect(r.totals).toMatchObject({ tenantTotal: 770000, landlordTotal: 105000, holdTotal: 0, depositReturn: 49230000 });
  });

  it('특약 기간(24개월)을 넘으면 벽지도 표준 기준', () => {
    const r = computeSettlement({
      changes: DEMO_CHANGES.slice(0, 1),
      lease: DEMO_LEASE,
      items: withCosts(),
      moveInDate: '2024-03-02',
      moveOutDate: '2026-04-02', // 25개월
    });
    expect(r.items[0].basis).toMatchObject({ type: 'standard', clauseNo: null });
    expect(r.items[0].tenantAmount).toBe(round100(480000 * (1 - 25 / 72)));
  });

  it('display 특약은 금액에 반영하지 않고 displayClauses로만', () => {
    const lease = { ...DEMO_LEASE, clauses: [clause(1, 'NAIL_HOLES_ALLOW'), clause(2, 'PET_DAMAGE')] };
    const r = computeSettlement({ changes: DEMO_CHANGES.slice(0, 1), lease, items: withCosts(), moveInDate: '2024-03-02', moveOutDate: '2026-03-02' });
    expect(r.items[0].basis.type).toBe('standard');
    expect(r.fees).toEqual([]);
    expect(r.displayClauses.map((c) => c.clauseNo)).toEqual([1]);
    expect(r.totals.tenantTotal).toBe(320000);
  });

  it('사람이 고른 부담자가 기본값보다 우선, 잔존가치는 0 아래로 내려가지 않음, 견적 없으면 0', () => {
    const r = computeSettlement({
      changes: DEMO_CHANGES,
      lease: null,
      items: { BALCONY_SCREEN: { estimateCost: 45000, payer: 'tenant' }, KITCHEN_HOOD_FILTER: { estimateCost: 60000, payer: 'bogus' } },
      moveInDate: '2014-03-02',
      moveOutDate: '2026-03-02',
    });
    const screen = r.items[3];
    expect(screen).toMatchObject({ payer: 'tenant', defaultPayer: 'hold', tenantAmount: 0 });
    expect(screen.basis).toMatchObject({ type: 'standard', residual: 0, stdAmount: 0 });
    expect(r.items[2].payer).toBe('landlord'); // 잘못된 값 → 기본값
    expect(r.items[0]).toMatchObject({ estimateCost: null, tenantAmount: 0 });
    expect(r.totals).toMatchObject({ deposit: null, depositReturn: null });
  });

  it('applySmallBulk: 기준 이하만, 견적 없는 항목은 그대로, threshold 지정', () => {
    const items = [
      { itemCode: 'A', estimateCost: 50000, payer: 'tenant' },
      { itemCode: 'B', estimateCost: 50001, payer: 'tenant' },
      { itemCode: 'C', estimateCost: null, payer: 'hold' },
    ];
    expect(applySmallBulk(items).map((i) => i.payer)).toEqual(['landlord', 'tenant', 'hold']);
    expect(applySmallBulk(items, 100000).map((i) => i.payer)).toEqual(['landlord', 'landlord', 'hold']);
  });
});

// --- API ---

/** 시연용 입주·퇴거 리포트를 스냅샷으로 직접 넣는다. */
function insertDemoReports(db, unitId, contractorId) {
  const allZones = ZONES.map((zone) => ({ zone, role: 'author' }));
  const tenantZones = ['거실', '주방', '화장실'].map((zone) => ({ zone, role: 'tenant' }));
  const moveInSnap = {
    items: [{ id: 901, item_code: 'BATHROOM_SILICONE', state: 'minor' }],
    images: [
      { id: 1, item_id: null, zone: '거실' },
      { id: 2, item_id: null, zone: '주방' },
    ],
    zoneConfirmations: [...allZones, ...tenantZones],
  };
  const moveOutSnap = {
    items: [
      { id: 911, item_code: 'LIVING_WALLPAPER', state: 'damaged' },
      { id: 912, item_code: 'BATHROOM_SILICONE', state: 'damaged' },
      { id: 913, item_code: 'KITCHEN_HOOD_FILTER', state: 'minor' },
      { id: 914, item_code: 'BALCONY_SCREEN', state: 'damaged' },
    ],
    images: [],
    zoneConfirmations: allZones,
  };
  const add = (type, snap, createdAt) => {
    const inspId = db
      .prepare("INSERT INTO inspections (unit_id, created_by, type, flow, status) VALUES (?, ?, ?, 'baseline', 'reported')")
      .run(unitId, contractorId, type).lastInsertRowid;
    const reportId = db
      .prepare("INSERT INTO reports (inspection_id, unit_id, type, flow, grade, created_by, created_at) VALUES (?, ?, ?, 'baseline', 'A', ?, ?)")
      .run(inspId, unitId, type, contractorId, createdAt).lastInsertRowid;
    db.prepare('INSERT INTO report_snapshots (report_id, snapshot_json) VALUES (?, ?)').run(reportId, JSON.stringify(snap));
    return reportId;
  };
  return {
    moveIn: add('move_in', moveInSnap, '2024-03-01 10:00:00'),
    moveOut: add('move_out_post', moveOutSnap, '2026-03-02 10:00:00'),
  };
}

describe('정산 API', () => {
  let app, db, ids, u1234, u345, rep;
  const as = (uid) => ({ 'x-user-id': String(uid) });

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}' });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    const unitId = (name) => db.prepare('SELECT id FROM units WHERE name = ?').get(name).id;
    u1234 = unitId('1234호');
    u345 = unitId('345호');
    rep = insertDemoReports(db, u1234, ids.contractor);
  });

  const create = () =>
    request(app).post('/api/settlements').set(as(ids.owner)).send({ moveInReportId: rep.moveIn, moveOutReportId: rep.moveOut });

  it('시연 흐름: 생성 → 견적 입력 → 소액 일괄 → 770,000 / 105,000 / 49,230,000', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    const s = res.body.data.settlement;
    expect(s).toMatchObject({
      unitId: u1234,
      moveInReportId: rep.moveIn,
      moveOutReportId: rep.moveOut,
      status: 'draft',
      moveInDate: '2024-03-02',
      moveOutDate: '2026-03-02',
      elapsedMonths: 24,
    });
    expect(s.items.map((it) => [it.itemCode, it.evidence, it.payer])).toEqual([
      ['LIVING_WALLPAPER', 'high', 'tenant'],
      ['KITCHEN_HOOD_FILTER', 'high', 'landlord'],
      ['BATHROOM_SILICONE', 'mid', 'tenant'],
      ['BALCONY_SCREEN', 'low', 'hold'],
    ]);
    expect(s.items.every((it) => it.estimateCost === null && it.tenantResponse === null)).toBe(true);

    for (const [code, cost] of Object.entries(DEMO_COSTS)) {
      const p = await request(app).patch(`/api/settlements/${s.id}/items/${code}`).set(as(ids.owner)).send({ estimateCost: cost });
      expect(p.status).toBe(200);
    }

    const bulk = await request(app).post(`/api/settlements/${s.id}/bulk-small`).set(as(ids.owner)).send({});
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.changedItemCodes).toEqual(['BALCONY_SCREEN']);
    expect(bulk.body.data.threshold).toBe(50000);

    const got = await request(app).get(`/api/settlements/${s.id}`).set(as(ids.tenant));
    expect(got.status).toBe(200);
    const final = got.body.data.settlement;
    const wall = final.items.find((it) => it.itemCode === 'LIVING_WALLPAPER');
    expect(wall.basis).toMatchObject({ type: 'clause', clauseNo: 3, stdAmount: 320000, residual: 0.6667 });
    expect(final.fees.map((f) => [f.clauseNo, f.amount])).toEqual([[4, 200000]]);
    expect(final.manualClauses.map((c) => c.clauseNo)).toEqual([6]);
    expect(final.totals).toEqual({
      tenantTotal: 770000,
      landlordTotal: 105000,
      holdTotal: 0,
      deposit: 50000000,
      depositReturn: 49230000,
    });
  });

  it('같은 리포트 쌍으로 다시 만들면 기존 정산(200)', async () => {
    const a = await create();
    const b = await create();
    expect(b.status).toBe(200);
    expect(b.body.data.settlement.id).toBe(a.body.data.settlement.id);
  });

  it('PATCH로 부담자를 바꾸면 합계가 바뀐다', async () => {
    const id = (await create()).body.data.settlement.id;
    await request(app).patch(`/api/settlements/${id}/items/KITCHEN_HOOD_FILTER`).set(as(ids.owner)).send({ estimateCost: 60000, payer: 'tenant' });
    const s = (await request(app).get(`/api/settlements/${id}`).set(as(ids.owner))).body.data.settlement;
    const hood = s.items.find((it) => it.itemCode === 'KITCHEN_HOOD_FILTER');
    // 후드 필터 내구 8년, 24개월 → 잔존 75%
    expect(hood).toMatchObject({ payer: 'tenant', defaultPayer: 'landlord', tenantAmount: 45000 });
    expect(s.totals.tenantTotal).toBe(245000);
  });

  it('권한: tenant·contractor는 수정 403, contractor·다른 사람은 조회 403', async () => {
    const id = (await create()).body.data.settlement.id;
    for (const uid of [ids.tenant, ids.contractor]) {
      const p = await request(app).patch(`/api/settlements/${id}/items/LIVING_WALLPAPER`).set(as(uid)).send({ payer: 'landlord' });
      expect(p.status).toBe(403);
      const b = await request(app).post(`/api/settlements/${id}/bulk-small`).set(as(uid)).send({});
      expect(b.status).toBe(403);
    }
    expect((await request(app).get(`/api/settlements/${id}`).set(as(ids.contractor))).status).toBe(403);
    expect((await request(app).get(`/api/settlements/${id}`)).status).toBe(401);
  });

  it('생성: tenant 403, 입주·퇴거 조합 아님 400, 없는 리포트 404', async () => {
    const t = await request(app).post('/api/settlements').set(as(ids.tenant)).send({ moveInReportId: rep.moveIn, moveOutReportId: rep.moveOut });
    expect(t.status).toBe(403);
    const swapped = await request(app).post('/api/settlements').set(as(ids.owner)).send({ moveInReportId: rep.moveOut, moveOutReportId: rep.moveIn });
    expect(swapped.status).toBe(400);
    expect(swapped.body.error.code).toBe('TYPE_MISMATCH');
    const missing = await request(app).post('/api/settlements').set(as(ids.owner)).send({ moveInReportId: 9999, moveOutReportId: rep.moveOut });
    expect(missing.status).toBe(404);
  });

  it('다른 호실 리포트 쌍은 400 UNIT_MISMATCH', async () => {
    const other = insertDemoReports(db, u345, ids.contractor);
    const res = await request(app).post('/api/settlements').set(as(ids.owner)).send({ moveInReportId: rep.moveIn, moveOutReportId: other.moveOut });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNIT_MISMATCH');
  });

  it('PATCH 검증: 잘못된 부담자·견적 400, 없는 항목 404, 확정된 정산 400', async () => {
    const id = (await create()).body.data.settlement.id;
    const bad = await request(app).patch(`/api/settlements/${id}/items/LIVING_WALLPAPER`).set(as(ids.owner)).send({ payer: 'nobody' });
    expect(bad.body.error.code).toBe('INVALID_PAYER');
    const cost = await request(app).patch(`/api/settlements/${id}/items/LIVING_WALLPAPER`).set(as(ids.owner)).send({ estimateCost: -1 });
    expect(cost.body.error.code).toBe('INVALID_COST');
    const nf = await request(app).patch(`/api/settlements/${id}/items/LIVING_FLOORING`).set(as(ids.owner)).send({ payer: 'tenant' });
    expect(nf.status).toBe(404);

    db.prepare("UPDATE settlements SET status = 'confirmed' WHERE id = ?").run(id);
    const locked = await request(app).patch(`/api/settlements/${id}/items/LIVING_WALLPAPER`).set(as(ids.owner)).send({ payer: 'landlord' });
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe('SETTLEMENT_CONFIRMED');
  });
});
