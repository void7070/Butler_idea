import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { buildHouseLog, filterHouseLogForTenant, leaseIdForDate, toIso, HOUSE_LOG_KINDS } from '../src/lib/houseLog.js';

const LEASE_A = {
  id: 1,
  tenantUserId: 3,
  tenantName: '박임차',
  deposit: 50_000_000,
  startDate: '2024-03-02',
  endDate: '2026-03-02',
  tenantConfirmedAt: '2024-03-01T10:00:00.000Z',
  clauses: [{ clauseNo: 3 }, { clauseNo: 4 }],
};
const LEASE_B = {
  id: 2,
  tenantUserId: 4,
  tenantName: '최임차',
  deposit: 30_000_000,
  startDate: '2026-04-01',
  endDate: '2028-04-01',
  tenantConfirmedAt: null,
  clauses: [{ clauseNo: 1 }],
};
const snap = (typeLabel, grade, states) => ({
  inspection: { typeLabel },
  grade,
  items: states.map((state) => ({ state })),
  parties: { contractor: { name: '이시공' } },
});

describe('houseLog (순수)', () => {
  it('toIso: 날짜만 → 현지 자정(종료는 23:59:59), 시간대 없는 시각 → 현지, ISO → 그대로', () => {
    expect(toIso('2024-03-02')).toBe(new Date(2024, 2, 2).toISOString());
    expect(toIso('2024-03-02', { endOfDay: true })).toBe(new Date(2024, 2, 2, 23, 59, 59).toISOString());
    expect(toIso('2024-03-02 10:00:00')).toBe(new Date(2024, 2, 2, 10, 0, 0).toISOString());
    expect(toIso('2026-09-27T01:02:03.000Z')).toBe('2026-09-27T01:02:03.000Z');
    expect(toIso(null)).toBeNull();
  });

  it('leaseIdForDate: 기간 안 → 가장 가까운 이전 계약 → 가장 이른 이후 계약', () => {
    const leases = [LEASE_A, LEASE_B];
    expect(leaseIdForDate(leases, toIso('2025-01-01'))).toBe(1);
    expect(leaseIdForDate(leases, toIso('2026-03-20'))).toBe(1); // 두 계약 사이 → 이전 계약
    expect(leaseIdForDate(leases, toIso('2027-01-01'))).toBe(2);
    expect(leaseIdForDate(leases, toIso('2020-01-01'))).toBe(1); // 첫 계약 전 → 가장 이른 계약
    expect(leaseIdForDate([], toIso('2025-01-01'))).toBeNull();
  });

  it('이벤트 생성·시간순 정렬·계약 묶음, 지나지 않은 계약 종료는 없음', () => {
    const log = buildHouseLog({
      unit: { id: 1, name: '1234호' },
      leases: [LEASE_B, LEASE_A],
      reports: [
        { id: 5, createdAt: '2026-03-02 10:00:00', snapshot: snap('퇴거 후', 'C', ['damaged', 'minor', 'broken']) },
        { id: 4, createdAt: '2024-03-02 10:00:00', snapshot: snap('입주 전', 'A', ['minor', 'normal']) },
        { id: 7, createdAt: '2026-04-05 10:00:00', snapshot: snap('입주 전', 'A', []) },
      ],
      verifies: { 4: { ok: true, storedHash: 'abcdef1234567890' }, 5: { ok: false, storedHash: '0011223344556677' } },
      tenantReports: [
        { id: 1, reportId: 4, itemCode: 'X', name: '신발장', state: 'minor', text: '경첩', status: 'approved', createdAt: '2024-03-04 20:00:00' },
      ],
      settlements: [
        {
          body: {
            id: 1,
            leaseId: 1,
            moveInReportId: 4,
            moveOutReportId: 5,
            status: 'confirmed',
            createdAt: '2026-09-27 00:00:00',
            confirmedAt: '2026-09-27T05:00:00.000Z',
            totals: { tenantTotal: 770000, depositReturn: 49230000 },
            items: [
              { name: '벽지', zone: '거실', tenantAmount: 480000, tenantResponse: 'agree', tenantRespondedAt: '2026-09-27T04:00:00.000Z' },
              { name: '방충망', zone: '베란다', tenantResponse: null },
            ],
          },
          links: [{ createdAt: '2026-09-27T03:00:00.000Z', expiresAt: '2026-10-04T03:00:00.000Z', firstViewedAt: '2026-09-27T03:30:00.000Z' }],
          verify: { ok: true, storedHash: 'ffeeddccbbaa9988' },
        },
      ],
      ledgerRows: [{ settlementId: 1, date: '2026-09-27', itemName: '방충망', amount: 45000, reason: '소액 일괄' }],
      now: new Date(2026, 8, 27),
    });

    expect(log.leases.map((l) => [l.id, l.range, l.tenantName])).toEqual([
      [1, '2024-03-02 ~ 2026-03-02', '박임차'],
      [2, '2026-04-01 ~ 2028-04-01', '최임차'],
    ]);
    const ats = log.events.map((e) => e.at);
    expect(ats).toEqual([...ats].sort());
    expect(log.events.map((e) => `${e.kind}:${e.leaseId}`)).toEqual([
      'clauses_confirmed:1', // 계약 시작 전날 확인
      'lease_start:1',
      'report:1',
      'tenant_report:1',
      'report:1',
      'lease_end:1',
      'lease_start:2',
      'report:2',
      'settlement_link:1',
      'settlement_link:1',
      'tenant_response:1',
      'settlement_confirmed:1',
      'ledger:1', // 확정과 같은 시각이면 확정 뒤
    ]); // 계약 B 종료(2028)는 아직 아님 → 없음

    const byKind = (k) => log.events.filter((e) => e.kind === k);
    expect(byKind('lease_start')[0]).toMatchObject({ title: '계약 시작', detail: expect.stringContaining('특약 2건'), link: '/owner/units/1/leases' });
    expect(byKind('report')[1]).toMatchObject({
      title: '퇴거 후 리포트 발행',
      detail: 'C등급 · 이상 3건',
      actor: '시공업자 이시공',
      integrity: { ok: false, shortHash: '00112233' },
      link: '/owner/reports/5',
    });
    expect(byKind('report')[2].integrity).toBeNull(); // 검증 결과 없음
    expect(byKind('tenant_report')[0]).toMatchObject({ title: '입주 제보 · 신발장', detail: '경미 · 경첩 · 승인', link: '/owner/reports/4/tenant-reports' });
    expect(byKind('settlement_link').map((e) => e.title)).toEqual(['임차인 정산 링크 생성', '임차인 정산 링크 최초 열람']);
    expect(byKind('tenant_response')[0].title).toBe('임차인 동의 · 벽지');
    expect(byKind('settlement_confirmed')[0]).toMatchObject({
      detail: '임차인 청구 770,000원 · 반환 49,230,000원',
      integrity: { ok: true, shortHash: 'ffeeddcc' },
      link: '/owner/settlement?moveInReportId=4&moveOutReportId=5',
    });
    expect(byKind('ledger')[0]).toMatchObject({ title: '수선비 장부 반영 · 방충망', detail: '45,000원 · 소액 일괄', link: '/owner/repair-ledger' });

    // 임차인 필터: 본인 계약 이벤트만, 장부 제외, 임차인 링크
    const forA = filterHouseLogForTenant(log, 3);
    expect(forA.leases.map((l) => l.id)).toEqual([1]);
    expect(forA.events.every((e) => e.leaseId === 1 && e.kind !== 'ledger')).toBe(true);
    expect(forA.events).toHaveLength(10); // 계약 1 이벤트 11개 − 장부 1
    const forB = filterHouseLogForTenant(log, 4);
    expect(forB.events.map((e) => e.kind)).toEqual(['lease_start', 'report']);
  });

  it('임차인 viewer: 임차인 화면 경로, 정산 화면 링크 없음', () => {
    const log = buildHouseLog({
      unit: { id: 1, name: '1234호' },
      leases: [LEASE_A],
      reports: [{ id: 4, createdAt: '2024-03-02 10:00:00', snapshot: snap('입주 전', 'A', []) }],
      tenantReports: [{ id: 1, reportId: 4, name: '신발장', state: 'minor', status: 'pending', createdAt: '2024-03-04 20:00:00' }],
      settlements: [
        {
          body: { id: 1, leaseId: 1, moveInReportId: 4, moveOutReportId: 5, status: 'draft', items: [] },
          links: [{ createdAt: '2026-09-27T03:00:00.000Z', expiresAt: '2026-10-04T03:00:00.000Z' }],
        },
      ],
      now: new Date(2026, 8, 27),
      viewer: 'tenant',
    });
    const link = (k) => log.events.find((e) => e.kind === k).link;
    expect(link('report')).toBe('/tenant/reports/4');
    expect(link('tenant_report')).toBe('/tenant/reports/4');
    expect(link('lease_start')).toBe('/tenant/reports');
    expect(link('settlement_link')).toBeNull();
    expect(log.events.find((e) => e.kind === 'tenant_report').detail).toBe('경미 · 대기');
  });
});

describe('GET /api/units/:id/house-log', () => {
  let db, app, ids, u1234, u345;
  const NOW = '2026-09-27T03:00:00.000Z';
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const houseLog = (unitId, uid) => request(app).get(`/api/units/${unitId}/house-log`).set(as(uid));
  const kinds = (events) => [...new Set(events.map((e) => e.kind))].sort();

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db, { now: new Date(NOW) });
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(NOW) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차'), tenant345: idByName('최임차') };
    const unitByName = (name) => db.prepare('SELECT id FROM units WHERE name = ?').get(name).id;
    u1234 = unitByName('1234호');
    u345 = unitByName('345호');
  });

  /** 시연 순서: 소액 일괄 → 링크 → 열람 → 두 항목 동의 (→ 합의 확정) */
  async function shareAndAgree() {
    await request(app).post('/api/settlements/1/bulk-small').set(as(ids.owner)).send({});
    const token = (await request(app).post('/api/settlements/1/share').set(as(ids.owner))).body.data.token;
    await request(app).get(`/api/share/settlement/${token}`);
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response: 'agree' });
    }
  }

  it('권한: 헤더 없음 401, 시공업자 403, 다른 호실 임차인 403, 없는 호실 404', async () => {
    expect((await request(app).get(`/api/units/${u1234}/house-log`)).status).toBe(401);
    expect((await houseLog(u1234, ids.contractor)).status).toBe(403);
    expect((await houseLog(u1234, ids.tenant345)).status).toBe(403);
    expect((await houseLog(999, ids.owner)).status).toBe(404);
    expect((await houseLog(u1234, ids.owner)).status).toBe(200);
    expect((await houseLog(u1234, ids.tenant)).status).toBe(200);
  });

  it('시연 데이터 1234호 — 정산 확정 전: 계약·특약 확인·종료·리포트·입주 제보 (+ 링크·응답)', async () => {
    const before = (await houseLog(u1234, ids.owner)).body.data;
    expect(before.unit).toEqual({ id: u1234, name: '1234호' });
    expect(before.leases).toHaveLength(1);
    expect(kinds(before.events)).toEqual(['clauses_confirmed', 'lease_end', 'lease_start', 'report', 'tenant_report']);
    expect(before.events.filter((e) => e.kind === 'report')).toHaveLength(4); // 정기 2 + 입주 전 + 퇴거 후
    expect(before.events.filter((e) => e.kind === 'report').every((e) => e.integrity?.ok === true)).toBe(true);
    expect(before.events.every((e) => e.leaseId === before.leases[0].id)).toBe(true);

    await shareAndAgree();
    const shared = (await houseLog(u1234, ids.owner)).body.data;
    expect(kinds(shared.events)).toEqual([
      'clauses_confirmed', 'lease_end', 'lease_start', 'report', 'settlement_link', 'tenant_report', 'tenant_response',
    ]);
    expect(shared.events.filter((e) => e.kind === 'settlement_link').map((e) => e.title)).toEqual([
      '임차인 정산 링크 생성',
      '임차인 정산 링크 최초 열람',
    ]);
  });

  it('시연 데이터 1234호 — 정산 확정 후: 9가지 이벤트가 모두, 확정·장부 포함', async () => {
    await shareAndAgree();
    expect((await request(app).post('/api/settlements/1/confirm').set(as(ids.owner))).status).toBe(200);

    const { events } = (await houseLog(u1234, ids.owner)).body.data;
    // carryover(창 20)는 이전 기록을 가져온 입주 리포트가 있을 때만 — 시드에는 없다 (test/carryover.test.js)
    expect(kinds(events)).toEqual(HOUSE_LOG_KINDS.filter((k) => k !== 'carryover').sort());
    const confirmed = events.find((e) => e.kind === 'settlement_confirmed');
    expect(confirmed).toMatchObject({ detail: '임차인 청구 770,000원 · 반환 49,230,000원', integrity: { ok: true } });
    const ledger = events.filter((e) => e.kind === 'ledger');
    expect(ledger.reduce((sum, e) => sum + Number(e.detail.split('원')[0].replace(/,/g, '')), 0)).toBe(105000);
    // 확정·장부는 마지막 (같은 시각이면 확정 → 장부)
    expect(events.slice(-1 - ledger.length).map((e) => e.kind)).toEqual(['settlement_confirmed', ...ledger.map(() => 'ledger')]);

    // 정산서 변조 → 무결성 실패로 보인다
    db.prepare("UPDATE settlement_snapshots SET snapshot_json = replace(snapshot_json, '770000', '670000')").run();
    const tampered = (await houseLog(u1234, ids.owner)).body.data.events.find((e) => e.kind === 'settlement_confirmed');
    expect(tampered.integrity.ok).toBe(false);
  });

  it('임차인은 본인 계약 기간의 이벤트만 (장부 제외, 다른 임차인의 새 계약 안 보임)', async () => {
    await shareAndAgree();
    await request(app).post('/api/settlements/1/confirm').set(as(ids.owner));
    // 1234호에 최임차의 새 계약 등록
    const reg = await request(app)
      .post(`/api/units/${u1234}/leases`)
      .set(as(ids.owner))
      .send({ tenantUserId: ids.tenant345, deposit: 30000000, monthlyRent: 900000, startDate: '2026-10-01', endDate: '2028-10-01', clauses: [] });
    expect(reg.status).toBe(201);

    const owner = (await houseLog(u1234, ids.owner)).body.data;
    expect(owner.leases.map((l) => l.tenantName)).toEqual(['박임차', '최임차']);

    const park = (await houseLog(u1234, ids.tenant)).body.data;
    expect(park.leases.map((l) => l.tenantName)).toEqual(['박임차']);
    const parkLease = park.leases[0].id;
    expect(park.events.every((e) => e.leaseId === parkLease)).toBe(true);
    expect(park.events.some((e) => e.kind === 'ledger')).toBe(false);
    expect(park.events.some((e) => e.kind === 'settlement_confirmed')).toBe(true);
    expect(park.events.find((e) => e.kind === 'report').link).toMatch(/^\/tenant\/reports\//);

    const choi = (await houseLog(u1234, ids.tenant345)).body.data;
    expect(choi.leases.map((l) => l.tenantName)).toEqual(['최임차']);
    expect(choi.events.map((e) => e.kind)).toEqual(['lease_start']);
    expect(JSON.stringify(choi)).not.toContain('50,000,000'); // 박임차 보증금 안 보임
  });

  it('345호: 이전 기간 정기 점검 → 계약 시작 → 입주 전 리포트, 계약 종료는 아직 없음', async () => {
    const { events } = (await houseLog(u345, ids.owner)).body.data;
    expect(events.map((e) => e.kind)).toEqual(['report', 'lease_start', 'report']);
  });
});
