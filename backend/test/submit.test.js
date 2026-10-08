import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

let app;
let db;
let contractorId;

beforeEach(() => {
  db = createDb(':memory:');
  applySchema(db);
  seed(db);
  app = createApp(db);
  contractorId = db.prepare("SELECT id FROM users WHERE role='contractor'").get().id;
});

const asContractor = (req) => req.set('x-user-id', String(contractorId));
const unitId = () => db.prepare('SELECT id FROM units LIMIT 1').get().id;

async function createDraft(items) {
  const res = await asContractor(request(app).post('/api/inspections')).send({
    unitId: unitId(),
    type: 'periodic',
    items,
  });
  return res.body.data.inspection.id;
}

function snapshotOf(reportId) {
  const row = db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(reportId);
  return JSON.parse(row.snapshot_json);
}

describe('POST /api/inspections/:id/submit', () => {
  it('제출 시 reportId 반환 + status=reported + 등급 산출', async () => {
    const id = await createDraft([{ category: '거실', name: '창호', state: 'caution' }]);
    const res = await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    expect(res.status).toBe(201);
    const reportId = res.body.data.reportId;
    expect(reportId).toBeGreaterThan(0);

    const insp = db.prepare('SELECT status FROM inspections WHERE id = ?').get(id);
    expect(insp.status).toBe('reported');

    const report = db.prepare('SELECT grade FROM reports WHERE id = ?').get(reportId);
    expect(report.grade).toBe('B'); // 주의 1개
  });

  it('스냅샷에 등급/호실/당사자/항목/주의 문구가 담긴다', async () => {
    const id = await createDraft([{ category: '거실', name: '창호', state: 'caution' }]);
    const res = await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    const snap = snapshotOf(res.body.data.reportId);

    expect(snap.grade).toBe('B');
    expect(snap.unit.name).toBeTruthy();
    expect(snap.parties.contractor.name).toBe('이시공');
    expect(snap.items).toHaveLength(1);
    expect(snap.caution).toContain('법적 책임');
  });

  it('불변성: 제출 후 원본 항목을 DB에서 바꿔도 스냅샷은 그대로', async () => {
    const id = await createDraft([{ name: 'A', state: 'normal' }]);
    const res = await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    const reportId = res.body.data.reportId;
    const before = snapshotOf(reportId);

    // API로는 reported라 막히므로 DB를 직접 조작해 원본을 훼손
    db.prepare('DELETE FROM inspection_items WHERE inspection_id = ?').run(id);

    const after = snapshotOf(reportId);
    expect(after.items).toEqual(before.items);
    expect(after.items).toHaveLength(1);
  });

  it('제출 후 점검 수정/삭제는 차단(REPORTED_LOCKED)', async () => {
    const id = await createDraft([{ name: 'A', state: 'normal' }]);
    await asContractor(request(app).post(`/api/inspections/${id}/submit`));

    const patch = await asContractor(request(app).patch(`/api/inspections/${id}`)).send({ finalOpinion: 'x' });
    expect(patch.status).toBe(400);
    expect(patch.body.error.code).toBe('REPORTED_LOCKED');

    const del = await asContractor(request(app).delete(`/api/inspections/${id}`));
    expect(del.status).toBe(400);
  });

  it('재제출 시 400 ALREADY_REPORTED', async () => {
    const id = await createDraft([{ name: 'A', state: 'normal' }]);
    await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    const again = await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALREADY_REPORTED');
  });

  it('작성자가 아니면 403', async () => {
    const id = await createDraft([{ name: 'A', state: 'normal' }]);
    const ownerId = db.prepare("SELECT id FROM users WHERE role='owner'").get().id;
    const res = await request(app)
      .post(`/api/inspections/${id}/submit`)
      .set('x-user-id', String(ownerId));
    expect(res.status).toBe(403);
  });
});
