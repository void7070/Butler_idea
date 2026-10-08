import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { buildOwnerTodos, addMonths, LEGAL_NOTICE } from '../src/lib/todos.js';

const at = (y, m, d) => new Date(y, m - 1, d, 10);
const lease = (over = {}) => ({
  id: 1,
  unitId: 1,
  unitName: '101호',
  tenantName: '임차인',
  startDate: '2024-01-01',
  endDate: '2026-01-01',
  tenantConfirmed: true,
  ...over,
});
const kinds = (todos) => todos.map((t) => t.kind);
const only = (todos, kind) => todos.filter((t) => t.kind === kind);

describe('buildOwnerTodos (순수)', () => {
  it('move_out: 종료 60일 전부터 warn, 지나면 crit, 61일 전·확정 정산이 있으면 없음', () => {
    const l = lease({ endDate: '2026-03-02' });
    const run = (now, settlements = []) => only(buildOwnerTodos({ leases: [l], settlements, now }), 'move_out');
    expect(run(at(2025, 12, 31))).toEqual([]); // 61일 전
    expect(run(at(2026, 1, 1))[0]).toMatchObject({ dday: 60, severity: 'warn', title: '퇴거 점검과 보증금 공제 준비' });
    expect(run(at(2026, 3, 2))[0]).toMatchObject({ dday: 0, severity: 'warn' });
    expect(run(at(2026, 3, 3))[0]).toMatchObject({ dday: -1, severity: 'crit' });
    const confirmed = [{ id: 9, leaseId: 1, status: 'confirmed', items: [] }];
    expect(run(at(2026, 3, 3), confirmed)).toEqual([]);
    // 같은 호실의 더 최근 계약이 있으면 옛 계약은 퇴거 카드를 만들지 않는다
    const next = lease({ id: 2, startDate: '2026-03-02', endDate: '2028-03-02' });
    expect(only(buildOwnerTodos({ leases: [l, next], now: at(2026, 3, 3) }), 'move_out')).toEqual([]);
  });

  it('rent_report: 시작일 + 30일까지(당일 포함) 표시, 다음 날부터 없음, 법률 자문 아님 문구', () => {
    const l = lease({ startDate: '2026-09-01', endDate: '2028-09-01' });
    const run = (now) => only(buildOwnerTodos({ leases: [l], now }), 'rent_report');
    expect(run(at(2026, 9, 1))[0]).toMatchObject({ dueDate: '2026-10-01', dday: 30, severity: 'calm' });
    expect(run(at(2026, 9, 24))[0]).toMatchObject({ dday: 7, severity: 'warn' });
    expect(run(at(2026, 10, 1))[0]).toMatchObject({ dday: 0 });
    expect(run(at(2026, 10, 1))[0].detail).toContain(LEGAL_NOTICE);
    expect(run(at(2026, 10, 2))).toEqual([]);
  });

  it('renewal_notice: 만료 6개월 전 ~ 2개월 전은 "통지 기간 중", 그 뒤 만료까지 "통지 기간 지남"', () => {
    const l = lease({ startDate: '2024-09-01', endDate: '2026-09-01' });
    const run = (now) => only(buildOwnerTodos({ leases: [l], now }), 'renewal_notice');
    expect(run(at(2026, 2, 28))).toEqual([]); // 6개월 전 하루 전
    expect(run(at(2026, 3, 1))[0]).toMatchObject({ title: '갱신 거절 통지 기간 중', dueDate: '2026-07-01' });
    expect(run(at(2026, 7, 1))[0]).toMatchObject({ title: '갱신 거절 통지 기간 중', dday: 0 });
    expect(run(at(2026, 7, 2))[0]).toMatchObject({ title: '통지 기간 지남 · 묵시적 갱신 여부 확인', dueDate: '2026-09-01' });
    expect(run(at(2026, 9, 1))).toHaveLength(1);
    expect(run(at(2026, 9, 2))).toEqual([]); // 만료 뒤
  });

  it('addMonths: 없는 날은 말일로', () => {
    expect(addMonths('2026-08-31', -6)).toBe('2026-02-28');
    expect(addMonths('2026-08-31', -2)).toBe('2026-06-30');
  });

  it('lease_unconfirmed: 끝나지 않은 계약의 특약 미확인만', () => {
    const run = (l) => only(buildOwnerTodos({ leases: [l], now: at(2026, 9, 26) }), 'lease_unconfirmed');
    expect(run(lease({ endDate: '2027-01-01', tenantConfirmed: false }))[0]).toMatchObject({ severity: 'warn', dday: null });
    expect(run(lease({ endDate: '2027-01-01', tenantConfirmed: true }))).toEqual([]);
    expect(run(lease({ endDate: '2026-01-01', tenantConfirmed: false }))).toEqual([]);
  });

  it('report_window: 호실의 최근 입주 리포트 기간이 열려 있으면 대기·미확인 구역 수와 마감 D-n', () => {
    const reports = [
      { id: 3, unitId: 1, unitName: '101호', windowStart: '2026-09-24', unconfirmedZones: [] },
      { id: 6, unitId: 1, unitName: '101호', windowStart: '2026-09-24', unconfirmedZones: ['현관', '거실'] },
    ];
    const tenantReports = [
      { id: 1, reportId: 6, status: 'pending' },
      { id: 2, reportId: 6, status: 'approved' },
      { id: 3, reportId: 3, status: 'pending' },
    ];
    const run = (now) => only(buildOwnerTodos({ reports, tenantReports, now }), 'report_window');
    const [c] = run(at(2026, 9, 26));
    expect(c).toMatchObject({
      title: '입주 제보 승인 대기 1건 · 미확인 구역 2',
      dueDate: '2026-10-01',
      dday: 5,
      severity: 'warn',
      link: '/owner/reports/6/tenant-reports',
    });
    expect(c.detail).toContain('마감 D-5');
    expect(run(at(2026, 10, 1))[0].detail).toContain('오늘 마감');
    expect(run(at(2026, 10, 2))).toEqual([]);
  });

  it('settlement_hold(crit) · settlement_waiting(warn, 링크를 보낸 뒤만) · 확정 정산은 없음', () => {
    const base = { unitId: 1, unitName: '101호', moveInReportId: 4, moveOutReportId: 5, leaseId: 1 };
    const items = [
      { payer: 'tenant', tenantResponse: 'object' },
      { payer: 'tenant', tenantResponse: null },
      { payer: 'landlord', tenantResponse: null },
    ];
    const run = (s) => buildOwnerTodos({ settlements: [{ ...base, id: 1, ...s }], now: at(2026, 9, 26) });
    expect(run({ status: 'hold', shared: true, items })[0]).toMatchObject({
      kind: 'settlement_hold',
      title: '정산 보류 · 임차인 이의 1건',
      severity: 'crit',
      link: '/owner/settlement?moveInReportId=4&moveOutReportId=5',
    });
    const waitingItems = [items[1], { payer: 'tenant', tenantResponse: 'agree' }];
    expect(run({ status: 'draft', shared: false, items: waitingItems })).toEqual([]);
    expect(run({ status: 'draft', shared: true, linkExpiresAt: '2026-10-03T01:00:00.000Z', items: waitingItems })[0]).toMatchObject({
      kind: 'settlement_waiting',
      title: '임차인 응답 대기 1건',
      severity: 'warn',
    });
    expect(run({ status: 'confirmed', shared: true, items })).toEqual([]);
  });

  it('정렬: crit > warn > calm, 같은 등급은 dday 오름차순, 기한 없음은 뒤', () => {
    const todos = buildOwnerTodos({
      leases: [
        lease({ id: 1, unitId: 1, unitName: '101호', startDate: '2024-01-01', endDate: '2026-09-01' }), // move_out crit
        lease({ id: 2, unitId: 2, unitName: '102호', startDate: '2026-09-20', endDate: '2028-09-20', tenantConfirmed: false }), // unconfirmed warn, rent calm(D-24)
        lease({ id: 3, unitId: 3, unitName: '103호', startDate: '2026-09-01', endDate: '2028-09-01' }), // rent warn(D-5)
      ],
      now: at(2026, 9, 26),
    });
    expect(todos.map((t) => [t.kind, t.unitName, t.severity])).toEqual([
      ['move_out', '101호', 'crit'],
      ['rent_report', '103호', 'warn'],
      ['lease_unconfirmed', '102호', 'warn'],
      ['rent_report', '102호', 'calm'],
    ]);
  });
});

describe('GET /api/owner/todos (창 13)', () => {
  const now = at(2026, 9, 26); // 시드 실행일 → 345호 계약 시작 2026-09-24, 제보 마감 2026-10-01
  let db, app, ids;
  const as = (uid) => ({ 'x-user-id': String(uid) });

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db, { now });
    app = createApp(db, { aiComplete: async () => '{}', now: () => now });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차'), tenant345: idByName('최임차') };
  });

  it('시드: 최임차가 345호 임차인, 345호 계약 시작 = 실행일 − 2일, 새 입주 리포트는 id 6', () => {
    const lease = db.prepare("SELECT * FROM leases WHERE unit_id = (SELECT id FROM units WHERE name = '345호')").get();
    expect(lease).toMatchObject({ tenant_user_id: ids.tenant345, start_date: '2026-09-24', end_date: '2028-09-24', deposit: 30_000_000, monthly_rent: 900_000 });
    const clauses = db.prepare('SELECT * FROM lease_clauses WHERE lease_id = ? ORDER BY clause_no').all(lease.id);
    expect(clauses.map((c) => [c.template_code, c.tenant_confirmed_at])).toEqual([
      ['CLEANING_FEE', null],
      [null, null],
    ]);
    const r = db.prepare('SELECT * FROM reports WHERE id = 6').get();
    expect(r).toMatchObject({ type: 'move_in', created_at: '2026-09-24 10:00:00' });
    const zones = db.prepare('SELECT role FROM zone_confirmations WHERE inspection_id = ?').all(r.inspection_id);
    expect(zones).toHaveLength(7);
    expect(zones.every((z) => z.role === 'author')).toBe(true);
    // 1234호 시연 리포트 id는 그대로
    expect(db.prepare('SELECT unit_id, type FROM reports WHERE id IN (4, 5) ORDER BY id').all().map((x) => x.type)).toEqual([
      'move_in',
      'move_out_post',
    ]);
  });

  it('시연 데이터: 345호 report_window 카드 "마감 D-5", 임차인 제보 가능', async () => {
    const res = await request(app).get('/api/owner/todos').set(as(ids.owner));
    expect(res.status).toBe(200);
    const { todos, units } = res.body.data;
    const win = todos.find((t) => t.kind === 'report_window');
    expect(win).toMatchObject({
      unitName: '345호',
      title: '입주 제보 승인 대기 0건 · 미확인 구역 7',
      dday: 5,
      link: '/owner/reports/6/tenant-reports',
    });
    expect(win.detail).toContain('마감 D-5');
    // 1234호는 계약이 끝났고 정산이 확정되지 않아 crit 퇴거 카드가 맨 위
    expect(todos[0]).toMatchObject({ kind: 'move_out', unitName: '1234호', severity: 'crit' });
    expect(kinds(todos.filter((t) => t.unitName === '345호')).sort()).toEqual(['lease_unconfirmed', 'rent_report', 'report_window']);
    expect(units).toEqual([
      expect.objectContaining({ unitName: '1234호', leaseStatus: 'ended', tenantName: '박임차', nextDue: null }),
      expect.objectContaining({
        unitName: '345호',
        leaseStatus: 'active',
        tenantName: '최임차',
        nextDue: expect.objectContaining({ kind: 'report_window', dday: 5 }),
      }),
    ]);

    const tr = await request(app)
      .post('/api/reports/6/tenant-reports')
      .set(as(ids.tenant345))
      .send({ itemCode: 'LIVING_WALLPAPER', state: 'minor', text: 'TV 벽면 얼룩' });
    expect(tr.status).toBe(201);
    const after = await request(app).get('/api/owner/todos').set(as(ids.owner));
    expect(after.body.data.todos.find((t) => t.kind === 'report_window')).toMatchObject({
      title: '입주 제보 승인 대기 1건 · 미확인 구역 7',
      severity: 'warn',
    });
  });

  it('권한: owner만, tenant·contractor 403, 사용자 없음 401', async () => {
    for (const uid of [ids.tenant, ids.tenant345, ids.contractor]) {
      expect((await request(app).get('/api/owner/todos').set(as(uid))).status).toBe(403);
    }
    expect((await request(app).get('/api/owner/todos')).status).toBe(401);
  });
});
