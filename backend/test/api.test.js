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
  const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
  ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
});

describe('GET /api/demo/users', () => {
  it('사용자 4명을 시공업자 우선 순서로 반환', async () => {
    const res = await request(app).get('/api/demo/users');
    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(4);
    expect(res.body.data.users[0].role).toBe('contractor');
  });
});

describe('POST /api/session/select-user', () => {
  it('유효한 userId면 사용자 반환', async () => {
    const res = await request(app).post('/api/session/select-user').send({ userId: ids.owner });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('김임대');
  });
  it('userId 누락 시 400 VALIDATION', async () => {
    const res = await request(app).post('/api/session/select-user').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
  it('없는 사용자면 404', async () => {
    const res = await request(app).post('/api/session/select-user').send({ userId: 9999 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/units', () => {
  it('헤더 없으면 401 NO_USER', async () => {
    const res = await request(app).get('/api/units');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_USER');
  });
  it('contractor는 전체 호실 2개', async () => {
    const res = await request(app).get('/api/units').set('x-user-id', String(ids.contractor));
    expect(res.status).toBe(200);
    expect(res.body.data.units).toHaveLength(2);
  });
  it('tenant는 본인 호실 1개', async () => {
    const res = await request(app).get('/api/units').set('x-user-id', String(ids.tenant));
    expect(res.status).toBe(200);
    expect(res.body.data.units).toHaveLength(1);
    expect(res.body.data.units[0].name).toBe('1234호');
  });
  it('잘못된 헤더 값이면 401 (사용자 미식별)', async () => {
    const res = await request(app).get('/api/units').set('x-user-id', 'abc');
    expect(res.status).toBe(401);
  });
});
