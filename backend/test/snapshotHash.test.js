import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { hashSnapshot, verifySnapshot } from '../src/lib/snapshotHash.js';

describe('snapshotHash (순수)', () => {
  it('hashSnapshot은 문자열의 SHA-256 hex', () => {
    expect(hashSnapshot('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashSnapshot('{"a":1}')).not.toBe(hashSnapshot('{"a":2}'));
  });

  it('verifySnapshot: 같으면 ok, 다르거나 저장 해시가 없으면 ok=false', () => {
    const json = '{"a":1}';
    const storedHash = hashSnapshot(json);
    expect(verifySnapshot({ snapshotJson: json, storedHash, issuedAt: 't' })).toEqual({
      storedHash,
      currentHash: storedHash,
      ok: true,
      issuedAt: 't',
    });
    expect(verifySnapshot({ snapshotJson: '{"a":2}', storedHash, issuedAt: 't' }).ok).toBe(false);
    expect(verifySnapshot({ snapshotJson: json, storedHash: null, issuedAt: 't' })).toMatchObject({ storedHash: null, ok: false });
  });
});

describe('리포트 해시 저장·검증 API', () => {
  let app, db, ids, demo;
  const as = (uid) => ({ 'x-user-id': String(uid) });

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db);
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    const u1234 = db.prepare("SELECT id FROM units WHERE name = '1234호'").get().id;
    const reportOf = (type) =>
      db.prepare('SELECT id FROM reports WHERE unit_id = ? AND type = ? ORDER BY id DESC LIMIT 1').get(u1234, type).id;
    demo = { moveIn: reportOf('move_in'), moveOut: reportOf('move_out_post') };
  });

  const tamper = (reportId) => {
    const row = db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(reportId);
    const snap = JSON.parse(row.snapshot_json);
    snap.items.find((it) => it.item_code === 'BATHROOM_SILICONE').state = 'minor';
    db.prepare('UPDATE report_snapshots SET snapshot_json = ? WHERE report_id = ?').run(JSON.stringify(snap), reportId);
  };

  it('제출 시 snapshot_json의 SHA-256을 저장한다', async () => {
    const unitId = db.prepare('SELECT id FROM units LIMIT 1').get().id;
    const created = await request(app)
      .post('/api/inspections')
      .set(as(ids.contractor))
      .send({ unitId, type: 'periodic', items: [{ category: '거실', name: '창호', state: 'normal' }] });
    const submit = await request(app).post(`/api/inspections/${created.body.data.inspection.id}/submit`).set(as(ids.contractor));
    expect(submit.status).toBe(201);

    const row = db.prepare('SELECT snapshot_json, snapshot_hash FROM report_snapshots WHERE report_id = ?').get(submit.body.data.reportId);
    expect(row.snapshot_hash).toBe(createHash('sha256').update(row.snapshot_json).digest('hex'));
  });

  it('시드 리포트는 모두 해시가 있고 검증 ok', () => {
    const rows = db.prepare('SELECT snapshot_json, snapshot_hash FROM report_snapshots').all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.snapshot_hash).toBe(hashSnapshot(r.snapshot_json));
  });

  it('GET /api/reports/:id/verify → ok=true, issuedAt=발행일', async () => {
    const res = await request(app).get(`/api/reports/${demo.moveOut}/verify`).set(as(ids.tenant));
    expect(res.status).toBe(200);
    const v = res.body.data;
    expect(v.ok).toBe(true);
    expect(v.storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.currentHash).toBe(v.storedHash);
    expect(v.issuedAt).toBe('2026-03-02 10:00:00');
  });

  it('스냅샷 JSON을 DB에서 바꾸면 ok=false, 되돌리면 다시 ok', async () => {
    const original = db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(demo.moveOut).snapshot_json;
    tamper(demo.moveOut);
    const bad = (await request(app).get(`/api/reports/${demo.moveOut}/verify`).set(as(ids.owner))).body.data;
    expect(bad.ok).toBe(false);
    expect(bad.currentHash).not.toBe(bad.storedHash);

    db.prepare('UPDATE report_snapshots SET snapshot_json = ? WHERE report_id = ?').run(original, demo.moveOut);
    const good = (await request(app).get(`/api/reports/${demo.moveOut}/verify`).set(as(ids.owner))).body.data;
    expect(good.ok).toBe(true);
  });

  it('verify 권한: 다른 호실 임차인 403, 헤더 없음 401, 없는 리포트 404', async () => {
    const r345 = db.prepare("SELECT r.id FROM reports r JOIN units u ON u.id = r.unit_id WHERE u.name = '345호'").get().id;
    expect((await request(app).get(`/api/reports/${r345}/verify`).set(as(ids.tenant))).status).toBe(403);
    expect((await request(app).get(`/api/reports/${demo.moveOut}/verify`)).status).toBe(401);
    expect((await request(app).get('/api/reports/9999/verify').set(as(ids.owner))).status).toBe(404);
  });

  it('공유 링크 응답에도 verify가 함께 온다 (변조 시 ok=false)', async () => {
    const share = await request(app).post(`/api/reports/${demo.moveOut}/share`).set(as(ids.owner));
    const token = share.body.data.token;
    expect((await request(app).get(`/api/share/${token}`)).body.data.verify.ok).toBe(true);
    tamper(demo.moveOut);
    expect((await request(app).get(`/api/share/${token}`)).body.data.verify.ok).toBe(false);
  });
});

describe('발표 시연 시드 (창 9)', () => {
  let app, db, owner, demo;

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db);
    owner = db.prepare("SELECT id FROM users WHERE name = '김임대'").get().id;
    const u1234 = db.prepare("SELECT id FROM units WHERE name = '1234호'").get().id;
    const reportOf = (type) => db.prepare('SELECT id FROM reports WHERE unit_id = ? AND type = ?').get(u1234, type).id;
    demo = { moveIn: reportOf('move_in'), moveOut: reportOf('move_out_post') };
  });

  it('비교 → 4개 변경 항목, 청구 가능성 높음·높음·보통·낮음', async () => {
    const res = await request(app)
      .get(`/api/reports/compare?leftId=${demo.moveIn}&rightId=${demo.moveOut}`)
      .set('x-user-id', String(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.diff.changes.map((c) => [c.itemCode, c.from, c.to, c.evidence])).toEqual([
      ['LIVING_WALLPAPER', 'normal', 'damaged', 'high'],
      ['KITCHEN_HOOD_FILTER', 'normal', 'minor', 'high'],
      ['BATHROOM_SILICONE', 'minor', 'damaged', 'mid'],
      ['BALCONY_SCREEN', 'normal', 'damaged', 'low'],
    ]);
    expect(res.body.data.diff.changes.every((c) => c.moveOutImages.length === 1)).toBe(true);
  });

  it('정산 초안 → 소액 일괄 → 임차인 770,000 · 임대인 105,000 · 반환 49,230,000', async () => {
    const created = await request(app)
      .post('/api/settlements')
      .set('x-user-id', String(owner))
      .send({ moveInReportId: demo.moveIn, moveOutReportId: demo.moveOut });
    expect(created.status).toBe(200); // 시드에 이미 있음
    const s = created.body.data.settlement;
    expect(s.elapsedMonths).toBe(24);
    expect(s.items.map((it) => it.estimateCost)).toEqual([480000, 60000, 150000, 45000]);

    const bulk = await request(app).post(`/api/settlements/${s.id}/bulk-small`).set('x-user-id', String(owner)).send({});
    expect(bulk.body.data.changedItemCodes).toEqual(['BALCONY_SCREEN']);
    expect(bulk.body.data.settlement.totals).toMatchObject({
      tenantTotal: 770000,
      landlordTotal: 105000,
      depositReturn: 49230000,
    });
  });
});
