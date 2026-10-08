import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { IMAGE_LIMITS } from '../src/config.js';

let app;
let db;
let ids;

beforeEach(() => {
  db = createDb(':memory:');
  applySchema(db);
  seed(db);
  app = createApp(db);
  const idByName = (n) => db.prepare('SELECT id FROM users WHERE name = ?').get(n).id;
  ids = {
    contractor: idByName('이시공'),
    owner: idByName('김임대'),
    tenant: idByName('박임차'),
    unit: db.prepare('SELECT id FROM units LIMIT 1').get().id,
    reportedInsp: db.prepare("SELECT id FROM inspections WHERE status='reported' LIMIT 1").get().id,
  };
});

const asContractor = (req) => req.set('x-user-id', String(ids.contractor));

describe('GET /api/inspections (목록)', () => {
  it('시공업자는 본인 점검 목록을 받는다 (draft/submitted/reported 포함)', async () => {
    const res = await asContractor(request(app).get('/api/inspections'));
    expect(res.status).toBe(200);
    const list = res.body.data.inspections;
    const statuses = list.map((i) => i.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('submitted');
    expect(list[0]).toHaveProperty('typeLabel');
    expect(list[0]).toHaveProperty('unit_name');
  });
  it('임대인은 빈 목록', async () => {
    const res = await request(app).get('/api/inspections').set('x-user-id', String(ids.owner));
    expect(res.body.data.inspections).toEqual([]);
  });
  it('헤더 없으면 401', async () => {
    const res = await request(app).get('/api/inspections');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/inspections', () => {
  it('전체 점검(periodic) 생성 → flow=whole, status=draft, items 저장', async () => {
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
      items: [{ category: '거실', name: '창호', state: 'caution', description: '실리콘 들뜸' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.inspection.flow).toBe('whole');
    expect(res.body.data.inspection.status).toBe('draft');
    expect(res.body.data.inspection.items).toHaveLength(1);
  });

  it('문제 점검(emergency) 생성 → flow=issue, observations 저장', async () => {
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'emergency',
      items: [{ category: '설비·배관', name: '누수' }],
      observations: [{ itemIndex: 0, label: '곰팡이 흔적', value: 'present' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.inspection.flow).toBe('issue');
    expect(res.body.data.inspection.observations).toHaveLength(1);
    // observation이 item에 연결됨
    expect(res.body.data.inspection.observations[0].item_id).toBe(
      res.body.data.inspection.items[0].id
    );
  });

  it('시공업자가 아니면 403', async () => {
    const res = await request(app)
      .post('/api/inspections')
      .set('x-user-id', String(ids.owner))
      .send({ unitId: ids.unit, type: 'periodic' });
    expect(res.status).toBe(403);
  });

  it('알 수 없는 유형이면 400 INVALID_TYPE', async () => {
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'nope',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TYPE');
  });

  it('없는 호실이면 404', async () => {
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: 99999,
      type: 'periodic',
    });
    expect(res.status).toBe(404);
  });

  it('unitId/type 누락 시 400 VALIDATION', async () => {
    const res = await asContractor(request(app).post('/api/inspections')).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('10MB 초과 이미지면 400 IMAGE_TOO_LARGE', async () => {
    const huge = 'A'.repeat(Math.ceil(((IMAGE_LIMITS.maxBytesPerImage + 10) * 4) / 3));
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
      images: [{ dataBase64: huge }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('이미지 21장이면 400 IMAGE_REPORT_LIMIT', async () => {
    const images = Array.from({ length: 21 }, () => ({ dataBase64: 'AAAA' }));
    const res = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
      images,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMAGE_REPORT_LIMIT');
  });
});

describe('GET /api/inspections/:id', () => {
  it('작성자는 상세 조회 가능', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
    });
    const id = created.body.data.inspection.id;
    const res = await asContractor(request(app).get(`/api/inspections/${id}`));
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.id).toBe(id);
  });

  it('작성자가 아니면 403', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
    });
    const id = created.body.data.inspection.id;
    const res = await request(app).get(`/api/inspections/${id}`).set('x-user-id', String(ids.owner));
    expect(res.status).toBe(403);
  });

  it('없는 점검이면 404', async () => {
    const res = await asContractor(request(app).get('/api/inspections/99999'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/inspections/:id', () => {
  it('finalOpinion만 수정해도 자식은 보존', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
      items: [{ category: '거실', name: '창호' }],
    });
    const id = created.body.data.inspection.id;
    const res = await asContractor(request(app).patch(`/api/inspections/${id}`)).send({
      finalOpinion: '경과 관찰 권장',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.final_opinion).toBe('경과 관찰 권장');
    expect(res.body.data.inspection.items).toHaveLength(1); // 보존됨
  });

  it('items를 보내면 자식 전체 교체', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
      items: [{ name: 'A' }, { name: 'B' }],
    });
    const id = created.body.data.inspection.id;
    const res = await asContractor(request(app).patch(`/api/inspections/${id}`)).send({
      items: [{ name: 'C' }],
    });
    expect(res.body.data.inspection.items).toHaveLength(1);
    expect(res.body.data.inspection.items[0].name).toBe('C');
  });

  it('이미지만 PATCH해도 items/observations는 보존된다', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'emergency',
      items: [{ category: '설비·배관', name: '누수', state: 'repair' }],
      observations: [{ itemIndex: 0, label: '곰팡이', value: 'present' }],
    });
    const id = created.body.data.inspection.id;

    const res = await asContractor(request(app).patch(`/api/inspections/${id}`)).send({
      images: [{ dataBase64: 'AAAA', kind: '근접', caption: '천장' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.items).toHaveLength(1); // 보존
    expect(res.body.data.inspection.observations).toHaveLength(1); // 보존
    expect(res.body.data.inspection.images).toHaveLength(1);
  });

  it('reported 점검 수정 시 400 REPORTED_LOCKED', async () => {
    const res = await asContractor(
      request(app).patch(`/api/inspections/${ids.reportedInsp}`)
    ).send({ finalOpinion: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REPORTED_LOCKED');
  });
});

describe('DELETE /api/inspections/:id', () => {
  it('draft 삭제 가능', async () => {
    const created = await asContractor(request(app).post('/api/inspections')).send({
      unitId: ids.unit,
      type: 'periodic',
    });
    const id = created.body.data.inspection.id;
    const res = await asContractor(request(app).delete(`/api/inspections/${id}`));
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const after = await asContractor(request(app).get(`/api/inspections/${id}`));
    expect(after.status).toBe(404);
  });

  it('reported 삭제 시 400 REPORTED_LOCKED', async () => {
    const res = await asContractor(request(app).delete(`/api/inspections/${ids.reportedInsp}`));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REPORTED_LOCKED');
  });
});
