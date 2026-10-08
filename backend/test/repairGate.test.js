import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { hashSnapshot } from '../src/lib/snapshotHash.js';
import { validateRepairSubmission, itemsWithoutPhoto } from '../src/lib/repairGate.js';

const code = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.code;
  }
};

describe('repairGate (순수)', () => {
  const items = [
    { id: 1, category: '설비·배관', name: '누수' },
    { id: 2, category: '전기', name: '콘센트' },
  ];

  it('수리 전·후: 항목 없음 / 사진 없는 항목 → PHOTO_REQUIRED_REPAIR, 메시지에 위치', () => {
    expect(code(() => validateRepairSubmission({ type: 'repair_pre', items: [], images: [] }))).toBe('PHOTO_REQUIRED_REPAIR');
    let err;
    try {
      validateRepairSubmission({ type: 'repair_post', items, images: [{ item_id: 1 }, { item_id: null }] });
    } catch (e) {
      err = e;
    }
    expect(err.code).toBe('PHOTO_REQUIRED_REPAIR');
    expect(err.status).toBe(400);
    expect(err.message).toContain('문제 항목 2(전기 콘센트)');
    expect(err.message).not.toContain('문제 항목 1');
    expect(itemsWithoutPhoto({ items, images: [{ item_id: 2 }] })).toEqual([{ index: 1, label: '설비·배관 누수' }]);
  });

  it('항목마다 사진이 있으면 통과, 긴급·정기·baseline은 사진 없어도 이 규칙에 걸리지 않음', () => {
    expect(code(() => validateRepairSubmission({ type: 'repair_pre', items, images: [{ item_id: 1 }, { item_id: 2 }] }))).toBe(null);
    for (const type of ['emergency', 'periodic', 'move_in', 'move_out_post']) {
      expect(code(() => validateRepairSubmission({ type, items: [], images: [] }))).toBe(null);
    }
  });
});

describe('수리 전·후 점검 API (창 26)', () => {
  let db, app, ids, units;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const ITEM = { category: '설비·배관', name: '누수', state: 'repair', location: '화장실 천장' };

  async function create(type, unitId, { photo = true } = {}) {
    const res = await request(app)
      .post('/api/inspections')
      .set(as(ids.contractor))
      .send({ unitId, type, items: [ITEM], images: photo ? [{ dataBase64: 'AAAA', itemIndex: 0 }] : [] });
    expect(res.status).toBe(201);
    return res.body.data.inspection.id;
  }
  const submit = (id) => request(app).post(`/api/inspections/${id}/submit`).set(as(ids.contractor));
  const patch = (id, body) => request(app).patch(`/api/inspections/${id}`).set(as(ids.contractor)).send(body);
  async function report(type, unitId) {
    const res = await submit(await create(type, unitId));
    expect(res.status).toBe(201);
    return res.body.data.reportId;
  }

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}' });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대') };
    units = Object.fromEntries(db.prepare('SELECT id, name FROM units').all().map((u) => [u.name, u.id]));
  });

  it('수리 전·후 사진 없음 → 400 PHOTO_REQUIRED_REPAIR, 사진 추가 후 제출 201', async () => {
    for (const type of ['repair_pre', 'repair_post']) {
      const id = await create(type, units['345호'], { photo: false });
      const bad = await submit(id);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('PHOTO_REQUIRED_REPAIR');
      expect(bad.body.error.message).toContain('문제 항목 1(설비·배관 누수)');
      expect(db.prepare('SELECT status FROM inspections WHERE id = ?').get(id).status).toBe('draft');

      expect((await patch(id, { images: [{ dataBase64: 'AAAA', itemIndex: 0 }] })).status).toBe(200);
      expect((await submit(id)).status).toBe(201);
    }
  });

  it('항목 없는 수리 전 점검 → 400, 긴급 점검은 사진·항목 없이도 기존대로 제출', async () => {
    const empty = await request(app).post('/api/inspections').set(as(ids.contractor)).send({ unitId: units['345호'], type: 'repair_pre' });
    expect((await submit(empty.body.data.inspection.id)).body.error.code).toBe('PHOTO_REQUIRED_REPAIR');

    const emergency = await create('emergency', units['345호'], { photo: false });
    expect((await submit(emergency)).status).toBe(201);
  });

  it('repairPreReportId: 수리 후 점검 + 같은 호실 수리 전 리포트만 (아니면 400 INVALID_REPAIR_LINK)', async () => {
    const pre345 = await report('repair_pre', units['345호']);
    const pre1234 = await report('repair_pre', units['1234호']);
    const emergency345 = await report('emergency', units['345호']);
    const post = await create('repair_post', units['345호']);

    for (const repairPreReportId of [pre1234, emergency345, 99999, 'x']) {
      const res = await patch(post, { repairPreReportId });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REPAIR_LINK');
    }
    // 수리 전 점검에는 연결할 수 없다
    const pre2 = await create('repair_pre', units['345호']);
    expect((await patch(pre2, { repairPreReportId: pre345 })).body.error.code).toBe('INVALID_REPAIR_LINK');

    const ok = await patch(post, { repairPreReportId: pre345 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.inspection.repairPreReportId).toBe(pre345);
    expect((await patch(post, { repairPreReportId: null })).body.data.inspection.repairPreReportId).toBe(null);
  });

  it('제출하면 스냅샷에 repairOf(해시 포함), 연결 없으면 키 없음, 기존 리포트 스냅샷 불변', async () => {
    const before = db.prepare('SELECT report_id, snapshot_json, snapshot_hash FROM report_snapshots ORDER BY report_id').all();
    const pre = await report('repair_pre', units['345호']);
    const preDate = db.prepare('SELECT created_at FROM reports WHERE id = ?').get(pre).created_at.slice(0, 10);

    const post = await create('repair_post', units['345호']);
    await patch(post, { repairPreReportId: pre });
    const postReport = (await submit(post)).body.data.reportId;
    const row = db.prepare('SELECT * FROM report_snapshots WHERE report_id = ?').get(postReport);
    expect(row.snapshot_hash).toBe(hashSnapshot(row.snapshot_json));
    expect(JSON.parse(row.snapshot_json).repairOf).toEqual({ reportId: pre, date: preDate });

    const unlinked = await report('repair_post', units['345호']);
    const snap = JSON.parse(db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(unlinked).snapshot_json);
    expect('repairOf' in snap).toBe(false);

    const after = db
      .prepare('SELECT report_id, snapshot_json, snapshot_hash FROM report_snapshots WHERE report_id <= ? ORDER BY report_id')
      .all(before.at(-1).report_id);
    expect(after).toEqual(before);
  });

  it('House Log: 수리 후 리포트는 "수리 완료" + 수리 전 리포트 #n + 비교 화면 링크, 기존 이벤트 종류 유지', async () => {
    const pre = await report('repair_pre', units['345호']);
    const post = await create('repair_post', units['345호']);
    await patch(post, { repairPreReportId: pre });
    const postReport = (await submit(post)).body.data.reportId;
    const unlinked = await report('repair_post', units['345호']);

    const log = (await request(app).get(`/api/units/${units['345호']}/house-log`).set(as(ids.owner))).body.data;
    const done = log.events.filter((e) => e.title === '수리 완료');
    expect(done).toHaveLength(2);
    const linked = done.find((e) => e.link.includes('compare'));
    expect(linked).toMatchObject({ kind: 'report', link: `/owner/compare?leftId=${pre}&rightId=${postReport}` });
    expect(linked.detail).toContain(`수리 전 리포트 #${pre}`);
    expect(linked.detail).toContain(`수리 후 점검 리포트 #${postReport}`);
    expect(linked.integrity.ok).toBe(true);
    expect(done.find((e) => e !== linked).link).toBe(`/owner/reports/${unlinked}`);
    // 수리 전 리포트는 기존 제목 그대로
    expect(log.events.some((e) => e.kind === 'report' && e.title === '수리 전 점검 리포트 발행')).toBe(true);
    // 시간순 정렬 유지
    const ats = log.events.map((e) => e.at);
    expect([...ats].sort()).toEqual(ats);
  });
});
