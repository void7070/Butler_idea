import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { normalizeLeaseInput, periodsOverlap, isValidDate } from '../src/lib/leaseInput.js';
import { getLeaseForDate } from '../src/repositories/leaseRepo.js';

const NEXT_LEASE = {
  deposit: 30000000,
  monthlyRent: 900000,
  startDate: '2026-04-01',
  endDate: '2028-04-01',
  clauses: [
    { templateCode: 'WALLPAPER_FLOOR_FULL' },
    { templateCode: 'CLEANING_FEE', params: { amount: 150000 } },
    { text: '  반려동물은 소형견 1마리만 허용한다.  ' },
  ],
};

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

describe('leaseInput (순수)', () => {
  it('정규화: 특약 번호 1부터, 파라미터는 정수, 자유 문장은 trim', () => {
    const r = normalizeLeaseInput({ tenantUserId: '3', ...NEXT_LEASE, deposit: '30000000' });
    expect(r).toMatchObject({ tenantUserId: 3, deposit: 30000000, monthlyRent: 900000, startDate: '2026-04-01' });
    expect(r.clauses).toEqual([
      { clauseNo: 1, templateCode: 'WALLPAPER_FLOOR_FULL', params: {} },
      { clauseNo: 2, templateCode: 'CLEANING_FEE', params: { amount: 150000 } },
      { clauseNo: 3, text: '반려동물은 소형견 1마리만 허용한다.' },
    ]);
  });

  it('검증: 임차인·금액·날짜·특약', () => {
    const base = { tenantUserId: 3, ...NEXT_LEASE };
    expect(code(() => normalizeLeaseInput({ ...base, tenantUserId: null }))).toBe('VALIDATION');
    expect(code(() => normalizeLeaseInput({ ...base, deposit: -1 }))).toBe('INVALID_AMOUNT');
    expect(code(() => normalizeLeaseInput({ ...base, monthlyRent: '' }))).toBe('INVALID_AMOUNT');
    expect(code(() => normalizeLeaseInput({ ...base, endDate: '2026-04-01' }))).toBe('INVALID_PERIOD');
    expect(code(() => normalizeLeaseInput({ ...base, startDate: '2026-02-30' }))).toBe('INVALID_PERIOD');
    expect(code(() => normalizeLeaseInput({ ...base, clauses: [{ templateCode: 'NOPE' }] }))).toBe('UNKNOWN_TEMPLATE');
    expect(code(() => normalizeLeaseInput({ ...base, clauses: [{ templateCode: 'CLEANING_FEE', params: { amount: -5 } }] }))).toBe(
      'INVALID_PARAM'
    );
    expect(code(() => normalizeLeaseInput({ ...base, clauses: [{ text: '   ' }] }))).toBe('VALIDATION');
    expect(normalizeLeaseInput({ ...base, clauses: undefined }).clauses).toEqual([]);
  });

  it('기간 겹침: 종료일 = 시작일(같은 날 인수인계)은 겹치지 않음', () => {
    const old = { startDate: '2024-03-02', endDate: '2026-03-02' };
    expect(periodsOverlap(old, { startDate: '2026-03-02', endDate: '2028-03-02' })).toBe(false);
    expect(periodsOverlap(old, { startDate: '2026-03-01', endDate: '2028-03-01' })).toBe(true);
    expect(periodsOverlap(old, { startDate: '2023-01-01', endDate: '2024-03-03' })).toBe(true);
    expect(isValidDate('2026-04-01')).toBe(true);
    expect(isValidDate('2026-4-1')).toBe(false);
  });
});

describe('계약 등록 API (창 12)', () => {
  let app, db, ids, u1234, u345;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const NOW = new Date('2026-09-26T09:00:00Z');

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db, { now: NOW }); // 345호 시드 계약 2026-09-24 ~ 2028-09-24 (창 13)
    app = createApp(db, { aiComplete: async () => '{}', now: () => NOW });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    const unitId = (name) => db.prepare('SELECT id FROM units WHERE name = ?').get(name).id;
    u1234 = unitId('1234호');
    u345 = unitId('345호');
  });

  const register = (unitId, body, uid = ids.owner) =>
    request(app).post(`/api/units/${unitId}/leases`).set(as(uid)).send({ tenantUserId: ids.tenant, ...body });

  it('GET /api/clause-templates: 칩용 5개', async () => {
    const res = await request(app).get('/api/clause-templates');
    expect(res.status).toBe(200);
    const t = res.body.data.templates;
    expect(t).toHaveLength(5);
    expect(Object.keys(t[0]).sort()).toEqual(['applyMode', 'code', 'defaultParams', 'defaultText', 'title']);
    expect(t.find((x) => x.code === 'CLEANING_FEE').defaultParams).toEqual({ amount: 200000 });
  });

  it('등록: 특약 1·2·3항, 템플릿 text·rule 생성, 자유 문장은 template NULL', async () => {
    const res = await register(u1234, NEXT_LEASE);
    expect(res.status).toBe(201);
    const lease = res.body.data.lease;
    expect(lease).toMatchObject({
      unitId: u1234,
      ownerUserId: ids.owner,
      tenantUserId: ids.tenant,
      tenantName: '박임차',
      deposit: 30000000,
      startDate: '2026-04-01',
      tenantConfirmed: false,
      tenantConfirmedAt: null,
    });
    expect(lease.clauses.map((c) => [c.clauseNo, c.templateCode, c.applyMode, c.tenantConfirmedAt])).toEqual([
      [1, 'WALLPAPER_FLOOR_FULL', 'auto', null],
      [2, 'CLEANING_FEE', 'auto', null],
      [3, null, 'manual', null],
    ]);
    expect(lease.clauses[1].text).toContain('150,000원');
    expect(lease.clauses[1].rule).toEqual({ kind: 'fixed_fee', payer: 'tenant', amount: 150000 });
    expect(lease.clauses[2]).toMatchObject({ text: '반려동물은 소형견 1마리만 허용한다.', rule: null });
  });

  it('새 계약을 등록해도 기존 1234호 정산은 770,000 / 105,000 / 49,230,000 그대로', async () => {
    expect((await register(u1234, NEXT_LEASE)).status).toBe(201);
    const reportOf = (type) => db.prepare('SELECT id FROM reports WHERE unit_id = ? AND type = ?').get(u1234, type).id;
    const created = await request(app)
      .post('/api/settlements')
      .set(as(ids.owner))
      .send({ moveInReportId: reportOf('move_in'), moveOutReportId: reportOf('move_out_post') });
    expect(created.status).toBe(200); // 시드 정산
    const bulk = await request(app).post(`/api/settlements/${created.body.data.settlement.id}/bulk-small`).set(as(ids.owner)).send({});
    const s = bulk.body.data.settlement;
    expect(s.moveInDate).toBe('2024-03-02');
    expect(s.elapsedMonths).toBe(24);
    expect(s.fees.map((f) => f.amount)).toEqual([200000]);
    expect(s.totals).toMatchObject({ tenantTotal: 770000, landlordTotal: 105000, deposit: 50000000, depositReturn: 49230000 });
  });

  it('getLeaseForDate: 기간 안 → 이전 시작 → 이후 시작 순', async () => {
    await register(u1234, NEXT_LEASE);
    expect(getLeaseForDate(db, u1234, '2024-03-02 10:00:00').startDate).toBe('2024-03-02');
    expect(getLeaseForDate(db, u1234, '2026-03-20').startDate).toBe('2024-03-02'); // 공백 기간 → 이전 시작
    expect(getLeaseForDate(db, u1234, '2026-05-01').startDate).toBe('2026-04-01');
    expect(getLeaseForDate(db, u1234, '2024-03-01').startDate).toBe('2024-03-02'); // 계약 시작 전 점검
    expect(getLeaseForDate(db, u345, '2026-05-01').startDate).toBe('2026-09-24'); // 이후 시작 계약
  });

  it('검증: 기간 겹침 LEASE_OVERLAP, 날짜 순서·음수 금액 400, tenant 아닌 사용자 400', async () => {
    const overlap = await register(u1234, { ...NEXT_LEASE, startDate: '2026-01-01', endDate: '2027-01-01' });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.code).toBe('LEASE_OVERLAP');
    expect((await register(u1234, { ...NEXT_LEASE, endDate: '2026-03-01' })).body.error.code).toBe('INVALID_PERIOD');
    expect((await register(u1234, { ...NEXT_LEASE, deposit: -100 })).body.error.code).toBe('INVALID_AMOUNT');
    const notTenant = await register(u1234, { ...NEXT_LEASE, tenantUserId: ids.contractor });
    expect(notTenant.status).toBe(400);
    expect(notTenant.body.error.code).toBe('INVALID_TENANT');
    expect(db.prepare('SELECT COUNT(*) AS n FROM leases').get().n).toBe(2); // 1234호 + 345호 시드
  });

  it('권한: owner만 등록(tenant·contractor 403), 헤더 없음 401', async () => {
    expect((await register(u1234, NEXT_LEASE, ids.tenant)).status).toBe(403);
    expect((await register(u1234, NEXT_LEASE, ids.contractor)).status).toBe(403);
    expect((await request(app).post(`/api/units/${u1234}/leases`).send(NEXT_LEASE)).status).toBe(401);
  });

  it('임차인이 호실에 없으면 tenant로 연결 → 그 호실 계약 이력 조회 가능', async () => {
    const before = await request(app).get(`/api/units/${u345}/leases`).set(as(ids.tenant));
    expect(before.status).toBe(403);
    // 345호 시드 계약(최임차, ~2028-09-24) 뒤 기간으로 등록
    expect((await register(u345, { ...NEXT_LEASE, startDate: '2028-09-24', endDate: '2030-09-24' })).status).toBe(201);
    const after = await request(app).get(`/api/units/${u345}/leases`).set(as(ids.tenant));
    expect(after.status).toBe(200);
    expect(after.body.data.leases).toHaveLength(1); // 본인 계약만
    // 한 번 더 등록해도 연결은 1건 (+ 최임차)
    await register(u345, { ...NEXT_LEASE, startDate: '2030-09-24', endDate: '2032-09-24' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM unit_users WHERE unit_id = ? AND role = 'tenant'").get(u345).n).toBe(2);
  });

  it('GET /api/units/:id/leases: 최신 먼저, 자동/수동 구분, contractor 403', async () => {
    await register(u1234, NEXT_LEASE);
    const res = await request(app).get(`/api/units/${u1234}/leases`).set(as(ids.owner));
    expect(res.status).toBe(200);
    const leases = res.body.data.leases;
    expect(leases.map((l) => l.startDate)).toEqual(['2026-04-01', '2024-03-02']);
    expect(leases[1].clauses.map((c) => c.applyMode)).toEqual(['auto', 'auto', 'manual']);
    expect(leases[1]).toMatchObject({ tenantConfirmed: true, tenantConfirmedAt: '2024-02-20' });
    expect((await request(app).get(`/api/units/${u1234}/leases`).set(as(ids.contractor))).status).toBe(403);
  });

  it('POST /api/leases/:id/confirm: 그 계약 임차인만, 다시 눌러도 시각 그대로', async () => {
    const id = (await register(u1234, NEXT_LEASE)).body.data.lease.id;
    expect((await request(app).post(`/api/leases/${id}/confirm`).set(as(ids.owner))).status).toBe(403);
    expect((await request(app).post('/api/leases/9999/confirm').set(as(ids.tenant))).status).toBe(404);

    const res = await request(app).post(`/api/leases/${id}/confirm`).set(as(ids.tenant));
    expect(res.status).toBe(200);
    const at = NOW.toISOString();
    expect(res.body.data.lease).toMatchObject({ tenantConfirmed: true, tenantConfirmedAt: at });
    expect(res.body.data.lease.clauses.every((c) => c.tenantConfirmedAt === at)).toBe(true);

    const later = createApp(db, { aiComplete: async () => '{}', now: () => new Date('2026-10-01T00:00:00Z') });
    const again = await request(later).post(`/api/leases/${id}/confirm`).set(as(ids.tenant));
    expect(again.body.data.lease.tenantConfirmedAt).toBe(at);
  });
});
