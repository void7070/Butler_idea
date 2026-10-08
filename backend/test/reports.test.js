import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

let app;
let db;
let ids;

beforeEach(() => {
  db = createDb(':memory:');
  applySchema(db);
  seed(db);
  app = createApp(db);
  const idByName = (n) => db.prepare('SELECT id FROM users WHERE name = ?').get(n).id;
  const unit1234 = db.prepare("SELECT id FROM units WHERE name='1234호'").get().id;
  const unit345 = db.prepare("SELECT id FROM units WHERE name='345호'").get().id;
  ids = {
    contractor: idByName('이시공'),
    owner: idByName('김임대'),
    tenant: idByName('박임차'),
    // 1234호 리포트(임차인 접근 가능) / 345호 리포트(임차인 접근 불가)
    reportOn1234: db.prepare('SELECT id FROM reports WHERE unit_id=? LIMIT 1').get(unit1234).id,
    reportOn345: db.prepare('SELECT id FROM reports WHERE unit_id=? LIMIT 1').get(unit345).id,
  };
});

const as = (req, userId) => req.set('x-user-id', String(userId));

describe('GET /api/reports', () => {
  it('contractor는 본인 생성 리포트 6개', async () => {
    const res = await as(request(app).get('/api/reports'), ids.contractor);
    expect(res.body.data.reports).toHaveLength(6);
  });
  it('owner는 소유 호실 리포트 6개', async () => {
    const res = await as(request(app).get('/api/reports'), ids.owner);
    expect(res.body.data.reports).toHaveLength(6);
  });
  it('tenant는 1234호 리포트 4개만', async () => {
    const res = await as(request(app).get('/api/reports'), ids.tenant);
    expect(res.body.data.reports).toHaveLength(4);
  });
  it('헤더 없으면 401', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/reports/:id', () => {
  it('접근 가능한 리포트는 스냅샷 반환', async () => {
    const res = await as(request(app).get(`/api/reports/${ids.reportOn1234}`), ids.tenant);
    expect(res.status).toBe(200);
    expect(res.body.data.report.grade).toBeTruthy();
  });
  it('tenant가 타 호실(345) 리포트 접근 시 403', async () => {
    const res = await as(request(app).get(`/api/reports/${ids.reportOn345}`), ids.tenant);
    expect(res.status).toBe(403);
  });
  it('없는 리포트면 404', async () => {
    const res = await as(request(app).get('/api/reports/99999'), ids.owner);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/reports/:id/confirm', () => {
  it('contractor는 확인 불가 403', async () => {
    const res = await as(request(app).post(`/api/reports/${ids.reportOn1234}/confirm`), ids.contractor);
    expect(res.status).toBe(403);
  });
  it('owner 확인 → 목록에 confirmed=true, 중복 호출 멱등', async () => {
    const r1 = await as(request(app).post(`/api/reports/${ids.reportOn1234}/confirm`), ids.owner);
    expect(r1.status).toBe(200);
    const r2 = await as(request(app).post(`/api/reports/${ids.reportOn1234}/confirm`), ids.owner);
    expect(r2.status).toBe(200); // 멱등
    const count = db
      .prepare('SELECT COUNT(*) n FROM report_confirmations WHERE report_id=? AND user_id=?')
      .get(ids.reportOn1234, ids.owner).n;
    expect(count).toBe(1);

    const list = await as(request(app).get('/api/reports'), ids.owner);
    const target = list.body.data.reports.find((r) => r.id === ids.reportOn1234);
    expect(target.confirmed).toBe(true);
  });
});

describe('공유 링크', () => {
  it('owner가 생성한 토큰으로 비인증 조회 가능', async () => {
    const share = await as(request(app).post(`/api/reports/${ids.reportOn1234}/share`), ids.owner);
    expect(share.status).toBe(201);
    const token = share.body.data.token;
    expect(token).toBeTruthy();

    // 헤더 없이(비인증) 조회
    const res = await request(app).get(`/api/share/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report.grade).toBeTruthy();
  });
  it('tenant도 공유 링크 생성 가능', async () => {
    const res = await as(request(app).post(`/api/reports/${ids.reportOn1234}/share`), ids.tenant);
    expect(res.status).toBe(201);
  });
  it('잘못된 토큰이면 404', async () => {
    const res = await request(app).get('/api/share/nope-not-a-token');
    expect(res.status).toBe(404);
  });
});
