import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { resetDemoDb } from '../src/db/reset.js';
import { createApp } from '../src/app.js';
import { parseDemoToday, demoNow, sqlDateTime } from '../src/lib/demoClock.js';
import { toDateString } from '../src/lib/tenantReport.js';

const fakeAi = async () => '{}';
const REAL = new Date(2026, 4, 3, 14, 25, 36, 789); // 실제 시각 가정: 2026-05-03 14:25:36

describe('demoClock (순수)', () => {
  it('parseDemoToday: 비어 있으면 null, YYYY-MM-DD만 허용, 없는 날짜는 throw', () => {
    expect(parseDemoToday(undefined)).toBeNull();
    expect(parseDemoToday('')).toBeNull();
    expect(parseDemoToday('  ')).toBeNull();
    expect(parseDemoToday(' 2026-09-27 ')).toBe('2026-09-27');
    expect(() => parseDemoToday('2026-02-30')).toThrow('DEMO_TODAY');
    expect(() => parseDemoToday('2026-9-27')).toThrow('DEMO_TODAY');
    expect(() => parseDemoToday('27-09-2026')).toThrow('DEMO_TODAY');
  });

  it('demoNow: 기준일이 있으면 기준일 + 실제 시·분·초, 없으면 실제 시각 그대로', () => {
    const d = demoNow('2026-09-27', REAL);
    expect(toDateString(d)).toBe('2026-09-27');
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([14, 25, 36, 789]);
    expect(demoNow(null, REAL)).toBe(REAL);
    expect(demoNow(undefined, REAL)).toBe(REAL);
  });

  it('sqlDateTime: 현지 시각 YYYY-MM-DD HH:MM:SS (시드와 같은 규칙)', () => {
    expect(sqlDateTime(new Date(2026, 8, 27, 3, 4, 5))).toBe('2026-09-27 03:04:05');
  });
});

describe('시드·초기화 기준일', () => {
  const now = demoNow('2026-09-27', new Date(2026, 0, 1, 12, 0, 0));

  const freshDb = () => {
    const db = createDb(':memory:');
    applySchema(db);
    seed(db, { now });
    return db;
  };
  const lease345 = (db) =>
    db.prepare("SELECT start_date, end_date FROM leases WHERE unit_id = (SELECT id FROM units WHERE name = '345호')").get();

  it('seed: 345호 계약 시작 = 기준일 − 2일, 입주 리포트(id 6) 날짜 = 시작일, 기존 정기 점검 3개 = 계약 기간 안 고정 날짜', () => {
    const db = freshDb();
    expect(lease345(db)).toEqual({ start_date: '2026-09-25', end_date: '2028-09-25' });
    expect(db.prepare('SELECT created_at FROM reports WHERE id = 6').get().created_at).toBe('2026-09-25 10:00:00');
    const early = db.prepare('SELECT created_at FROM reports WHERE id <= 3').all().map((r) => r.created_at);
    expect(early).toEqual(['2024-09-02 10:00:00', '2025-09-01 10:00:00', '2026-06-15 10:00:00']);
  });

  it('resetDemoDb: 같은 DB에서 바뀐 데이터를 지우고 초기 상태(리포트 6 · 정산 770,000)로', async () => {
    const db = freshDb();
    const app = createApp(db, { aiComplete: fakeAi, now: () => now });
    const ownerId = db.prepare("SELECT id FROM users WHERE name = '김임대'").get().id;
    const as = { 'x-user-id': String(ownerId) };

    // 연습으로 바뀐 상태: 소액 일괄 + 리포트 삭제 + 스냅샷 변조
    expect((await request(app).post('/api/settlements/1/bulk-small').set(as).send({})).status).toBe(200);
    db.prepare("UPDATE report_snapshots SET snapshot_json = '{}' WHERE report_id = 5").run();
    db.prepare('DELETE FROM report_confirmations').run();
    db.prepare('DELETE FROM share_links').run();
    db.prepare('DELETE FROM report_snapshots WHERE report_id = 1').run();
    db.prepare('DELETE FROM reports WHERE id = 1').run();

    const counts = resetDemoDb(db, { now });
    expect(counts).toMatchObject({ users: 4, units: 2, reports: 6, settlements: 1 });
    expect(lease345(db).start_date).toBe('2026-09-25');

    const s = (await request(app).get('/api/settlements/1').set(as)).body.data.settlement;
    expect(s.status).toBe('draft');
    expect(s.totals).toMatchObject({ tenantTotal: 770000, deposit: 50000000 });
    expect((await request(app).get('/api/reports/5/verify').set(as)).body.data.ok).toBe(true);
  });
});

describe('서버 "지금" = 기준일 (createApp 기본 now)', () => {
  it('GET /api/health: 기준일이 있으면 today = 기준일, demoToday: true', async () => {
    const db = createDb(':memory:');
    applySchema(db);
    const res = await request(createApp(db, { aiComplete: fakeAi, demoToday: '2026-09-27' })).get('/api/health');
    expect(res.body.data).toMatchObject({ status: 'ok', today: '2026-09-27', demoToday: true });
  });

  it('GET /api/health: 기준일이 없으면 today = 실제 오늘, demoToday: false', async () => {
    const db = createDb(':memory:');
    applySchema(db);
    const res = await request(createApp(db, { aiComplete: fakeAi, demoToday: null })).get('/api/health');
    expect(res.body.data).toMatchObject({ today: toDateString(new Date()), demoToday: false });
  });

  it('기준일로 시드 + 기준일 서버 → 345호 제보 마감 D-5, 새 제보 시각도 기준일', async () => {
    const db = createDb(':memory:');
    applySchema(db);
    seed(db, { now: demoNow('2026-09-27') });
    const app = createApp(db, { aiComplete: fakeAi, demoToday: '2026-09-27' });
    const id = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;

    const { todos } = (await request(app).get('/api/owner/todos').set('x-user-id', String(id('김임대')))).body.data;
    expect(todos.find((t) => t.unitName === '345호' && t.kind === 'report_window')).toMatchObject({ dday: 5 });

    const posted = await request(app)
      .post('/api/reports/6/tenant-reports')
      .set('x-user-id', String(id('최임차')))
      .send({ itemCode: 'LIVING_WINDOW', state: 'minor', text: '창틀 긁힘' });
    expect(posted.status).toBe(201);
    // 저장은 UTC — 기준일 현지 날짜와 하루 차이까지 허용
    const created = new Date(posted.body.data.tenantReport.createdAt.replace(' ', 'T')); // 시간대 없음 = 현지 시각
    expect(Math.abs(created - demoNow('2026-09-27'))).toBeLessThan(60_000);
  });
});
