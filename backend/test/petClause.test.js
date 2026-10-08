import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { computeSettlement, conditionalClausesFor, applySmallBulk, defaultPayer } from '../src/lib/settlement.js';
import { buildClause, clauseApplyMode, getClauseTemplate } from '../src/domain/clauseTemplates.js';
import { addDemoPetClause } from '../src/db/demoPet.js';
import { hashSnapshot } from '../src/lib/snapshotHash.js';

// 창 25: 조건부 특약(반려동물 손상) — 원인은 코드가 판단하지 않고, 임대인이 항목마다 "조건 해당"을 확인한다.

const clause = (clauseNo, templateCode, params) => {
  if (!templateCode) return { clauseNo, text: '그 밖의 파손은 임대인과 임차인이 협의하여 정한다.', templateCode: null, applyMode: 'manual', rule: null };
  const built = buildClause(templateCode, params);
  return {
    clauseNo,
    templateCode,
    templateTitle: getClauseTemplate(templateCode).title,
    applyMode: clauseApplyMode(templateCode),
    text: built.text,
    rule: built.rule,
  };
};

const DEMO_CHANGES = [
  { itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high' },
  { itemCode: 'BATHROOM_SILICONE', zone: '화장실', name: '실리콘', tier: 'core', from: 'minor', to: 'damaged', evidence: 'mid' },
  { itemCode: 'KITCHEN_HOOD_FILTER', zone: '주방', name: '후드 필터', tier: 'general', from: 'normal', to: 'minor', evidence: 'high' },
  { itemCode: 'BALCONY_SCREEN', zone: '베란다', name: '방충망', tier: 'core', from: 'normal', to: 'damaged', evidence: 'low' },
];
const DEMO_COSTS = { LIVING_WALLPAPER: 480000, BATHROOM_SILICONE: 150000, KITCHEN_HOOD_FILTER: 60000, BALCONY_SCREEN: 45000 };
const LEASE_1234 = {
  deposit: 50000000,
  startDate: '2024-03-02',
  clauses: [clause(3, 'WALLPAPER_FLOOR_FULL'), clause(4, 'CLEANING_FEE'), clause(6, null)],
};
const WITH_PET = { ...LEASE_1234, clauses: [...LEASE_1234.clauses, clause(5, 'PET_DAMAGE')] };
// 제3항(도배 전액)이 없는 계약 → 반려동물 특약 확인이 금액·근거를 바꾸는 경우
const PET_ONLY = { deposit: 50000000, startDate: '2024-03-02', clauses: [clause(4, 'CLEANING_FEE'), clause(5, 'PET_DAMAGE')] };

/** 소액 일괄 후(시연 순서) 입력. extra[code]로 항목 입력을 덧붙인다. */
function demoItems(extra = {}) {
  const base = DEMO_CHANGES.map((ch) => ({ itemCode: ch.itemCode, estimateCost: DEMO_COSTS[ch.itemCode], payer: defaultPayer(ch) }));
  return Object.fromEntries(applySmallBulk(base).map((it) => [it.itemCode, { ...it, ...extra[it.itemCode] }]));
}
const run = (lease, extra) =>
  computeSettlement({ changes: DEMO_CHANGES, lease, items: demoItems(extra), moveInDate: '2024-03-02', moveOutDate: '2026-03-02' });

describe('조건부 특약 순수 로직 (창 25)', () => {
  it('conditionalClausesFor: 대상 항목 이름에만, 조건 없는 특약은 빠진다', () => {
    expect(conditionalClausesFor(WITH_PET.clauses, '벽지')).toEqual([
      {
        clauseNo: 5,
        title: '반려동물 손상',
        text: '반려동물로 인한 문·문틀, 바닥재, 벽지 손상은 표준 기준에 따라 임차인이 부담한다.',
        condition: 'pet_damage',
      },
    ]);
    expect(conditionalClausesFor(WITH_PET.clauses, '실리콘')).toEqual([]);
    expect(conditionalClausesFor(null, '벽지')).toEqual([]);
  });

  it('체크 전: 결과는 반려동물 특약이 없을 때와 같고, "해당 가능" 안내만 붙는다', () => {
    const before = run(PET_ONLY);
    const wall = before.items[0];
    expect(wall.basis).toEqual({ type: 'standard', clauseNo: null, stdAmount: 320000, residual: 0.6667 });
    expect(wall).toMatchObject({ tenantAmount: 320000, conditionClauseNo: null, fullCostClauseNo: null });
    expect(wall.conditionalClauses.map((c) => c.clauseNo)).toEqual([5]);
    expect(before.items[1].conditionalClauses).toEqual([]);

    const noPet = run({ ...PET_ONLY, clauses: PET_ONLY.clauses.filter((c) => c.clauseNo !== 5) });
    expect(before.totals).toEqual(noPet.totals);
  });

  it('체크 후: 근거 = 특약 제5항(표준 기준), 금액은 표준 금액 그대로', () => {
    const r = run(PET_ONLY, { LIVING_WALLPAPER: { conditionClauseNo: 5 } });
    const wall = r.items[0];
    expect(wall.basis).toEqual({ type: 'clause', clauseNo: 5, kind: 'standard', stdAmount: 320000, residual: 0.6667 });
    expect(wall).toMatchObject({ tenantAmount: 320000, conditionClauseNo: 5 });
    expect(r.totals).toMatchObject({ tenantTotal: 610000, depositReturn: 49390000 });
  });

  it('그 항목의 조건부 특약이 아닌 번호, 임대인 부담 항목에는 적용하지 않는다', () => {
    const wrong = run(PET_ONLY, { LIVING_WALLPAPER: { conditionClauseNo: 4 } });
    expect(wrong.items[0].basis.type).toBe('standard');
    const landlord = run(PET_ONLY, { LIVING_WALLPAPER: { conditionClauseNo: 5, payer: 'landlord' } });
    expect(landlord.items[0]).toMatchObject({ basis: null, tenantAmount: 0, landlordAmount: 480000 });
  });

  it('full_cost 특약(제3항)이 같은 항목에 적용되면 그쪽이 우선 — 체크해도 480,000', () => {
    const r = run(WITH_PET, { LIVING_WALLPAPER: { conditionClauseNo: 5 } });
    const wall = r.items[0];
    expect(wall.basis).toEqual({ type: 'clause', clauseNo: 3, stdAmount: 320000, residual: 0.6667 });
    expect(wall).toMatchObject({ tenantAmount: 480000, fullCostClauseNo: 3, conditionClauseNo: 5 });
    expect(wall.conditionalClauses.map((c) => c.clauseNo)).toEqual([5]);
  });

  it('1234호 시연 값 불변: 반려동물 특약 추가 전·후, 체크 전·후 모두 770,000 / 105,000 / 49,230,000', () => {
    for (const r of [run(LEASE_1234), run(WITH_PET), run(WITH_PET, { LIVING_WALLPAPER: { conditionClauseNo: 5 } })]) {
      expect(r.totals).toEqual({ tenantTotal: 770000, landlordTotal: 105000, holdTotal: 0, deposit: 50000000, depositReturn: 49230000 });
    }
  });
});

describe('조건부 특약 API·demo:pet (창 25)', () => {
  let db, app, ids, settlementId;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const NOW = '2026-09-26T09:00:00.000Z';
  const patch = (code, body, uid = ids.owner) =>
    request(app).patch(`/api/settlements/${settlementId}/items/${code}`).set(as(uid)).send(body);
  const get = async () => (await request(app).get(`/api/settlements/${settlementId}`).set(as(ids.owner))).body.data.settlement;
  const itemOf = (s, code) => s.items.find((it) => it.itemCode === code);
  const share = async () => (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;

  async function confirmDemo() {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    const token = await share();
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response: 'agree' });
    }
    const c = await request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner));
    expect(c.status).toBe(200);
    return token;
  }

  /** "제3항이 없는 계약"을 만든다 (금액이 바뀌는 경우). */
  const dropClause3 = () =>
    db.prepare("DELETE FROM lease_clauses WHERE clause_no = 3 AND template_code = 'WALLPAPER_FLOOR_FULL'").run();

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(NOW) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
  });

  it('demo:pet: 1234호 정산 계약에 제5항 추가, 다시 실행하면 그대로, 특약 확인 상태 유지', async () => {
    expect(addDemoPetClause(db).status).toBe('added');
    expect(addDemoPetClause(db).status).toBe('exists');
    const unitId = db.prepare("SELECT id FROM units WHERE name = '1234호'").get().id;
    const leases = (await request(app).get(`/api/units/${unitId}/leases`).set(as(ids.owner))).body.data.leases;
    const lease = leases.find((l) => l.clauses.some((c) => c.clauseNo === 5));
    expect(lease.clauses.map((c) => c.clauseNo)).toEqual([3, 4, 5, 6]);
    expect(lease.tenantConfirmed).toBe(true);
  });

  it('demo:pet 뒤 1234호: 거실 벽지에 제5항 "해당 가능", 제3항이 먼저 → 시연 값 불변', async () => {
    addDemoPetClause(db);
    const s = await get();
    const wall = itemOf(s, 'LIVING_WALLPAPER');
    expect(wall).toMatchObject({ fullCostClauseNo: 3, conditionClauseNo: null, tenantAmount: 480000 });
    expect(wall.conditionalClauses.map((c) => c.clauseNo)).toEqual([5]);
    expect(s.items.filter((it) => it.conditionalClauses.length).map((it) => it.itemCode)).toEqual(['LIVING_WALLPAPER']);

    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    expect((await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 })).status).toBe(200);
    const after = await get();
    expect(itemOf(after, 'LIVING_WALLPAPER').basis).toMatchObject({ type: 'clause', clauseNo: 3 });
    expect(after.totals).toMatchObject({ tenantTotal: 770000, landlordTotal: 105000, depositReturn: 49230000 });
  });

  it('제3항이 없는 계약: 체크하면 근거 = 특약 제5항 원문, 금액 = 표준 320,000 · 체크 해제(null)면 원래대로', async () => {
    addDemoPetClause(db);
    dropClause3();
    const res = await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 });
    expect(res.status).toBe(200);
    const wall = itemOf(res.body.data.settlement, 'LIVING_WALLPAPER');
    expect(wall.basis).toMatchObject({ type: 'clause', clauseNo: 5, kind: 'standard', stdAmount: 320000 });
    expect(wall.basis.clause).toMatchObject({ clauseNo: 5, title: '반려동물 손상' });
    expect(wall.basis.clause.text).toContain('반려동물');
    expect(wall.tenantAmount).toBe(320000);

    const off = itemOf((await patch('LIVING_WALLPAPER', { conditionClauseNo: null })).body.data.settlement, 'LIVING_WALLPAPER');
    expect(off).toMatchObject({ conditionClauseNo: null, tenantAmount: 320000 });
    expect(off.basis).toMatchObject({ type: 'standard', clauseNo: null });
  });

  it('검증: 그 항목의 조건부 특약이 아니면 400 INVALID_CONDITION_CLAUSE', async () => {
    addDemoPetClause(db);
    for (const [code, no] of [['BATHROOM_SILICONE', 5], ['LIVING_WALLPAPER', 3], ['LIVING_WALLPAPER', 99], ['LIVING_WALLPAPER', '5']]) {
      const r = await patch(code, { conditionClauseNo: no });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('INVALID_CONDITION_CLAUSE');
    }
  });

  it('반려동물 특약이 없는 계약(시드 그대로)에서는 체크 불가', async () => {
    const r = await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 });
    expect(r.body.error.code).toBe('INVALID_CONDITION_CLAUSE');
  });

  it('권한·확정 후·응답 후 차단', async () => {
    addDemoPetClause(db);
    for (const uid of [ids.tenant, ids.contractor]) {
      expect((await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 }, uid)).status).toBe(403);
    }

    const token = await share();
    await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode: 'LIVING_WALLPAPER', response: 'agree' });
    const responded = await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 });
    expect(responded.status).toBe(400);
    expect(responded.body.error.code).toBe('ITEM_RESPONDED');

    db.prepare("UPDATE settlements SET status = 'confirmed' WHERE id = ?").run(settlementId);
    const locked = await patch('LIVING_WALLPAPER', { conditionClauseNo: null });
    expect(locked.body.error.code).toBe('SETTLEMENT_CONFIRMED');
  });

  it('확정 스냅샷·임차인 링크·증빙 패키지에 conditionClauseNo와 특약 원문이 들어가고, 확정 뒤 특약을 지워도 그대로', async () => {
    addDemoPetClause(db);
    dropClause3();
    await patch('LIVING_WALLPAPER', { conditionClauseNo: 5 });
    const token = await confirmDemo();

    const row = db.prepare('SELECT * FROM settlement_snapshots WHERE settlement_id = ?').get(settlementId);
    expect(row.snapshot_hash).toBe(hashSnapshot(row.snapshot_json));
    const frozen = JSON.parse(row.snapshot_json);
    const fw = itemOf(frozen, 'LIVING_WALLPAPER');
    expect(fw).toMatchObject({ conditionClauseNo: 5, tenantAmount: 320000 });
    expect(fw.basis.clause.text).toContain('반려동물');
    expect(frozen.totals).toMatchObject({ tenantTotal: 610000, depositReturn: 49390000 });

    // 확정 뒤 특약·체크를 바꿔도 스냅샷 그대로
    db.prepare('DELETE FROM lease_clauses WHERE clause_no = 5').run();
    db.prepare('UPDATE settlement_items SET condition_clause_no = NULL').run();
    expect(itemOf(await get(), 'LIVING_WALLPAPER')).toEqual(fw);

    const shared = (await request(app).get(`/api/share/settlement/${token}`)).body.data.settlement;
    const sw = itemOf(shared, 'LIVING_WALLPAPER');
    expect(sw).toMatchObject({ conditionClauseNo: 5, tenantAmount: 320000 });
    expect(sw.basis).toMatchObject({ type: 'clause', clauseNo: 5, kind: 'standard' });
    expect(sw.basis.clause.text).toContain('반려동물');

    const ev = (await request(app).get(`/api/settlements/${settlementId}/evidence`).set(as(ids.owner))).body.data.evidence;
    const ew = ev.items.find((it) => it.itemCode === 'LIVING_WALLPAPER');
    expect(ew).toMatchObject({ conditionClauseNo: 5, amount: 320000 });
    expect(ew.basis).toMatchObject({ type: 'clause', kind: 'standard', clauseNo: 5, title: '반려동물 손상' });
    expect(ew.basis.text).toContain('반려동물');
    expect(ew.basis.formula).toContain('표준 기준 금액');
  });
});
