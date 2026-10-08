import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { canCompare } from '../src/lib/compare.js';

describe('canCompare (순수)', () => {
  it('같은 호실 + 같은 유형 → ok', () => {
    expect(canCompare({ unit_id: 1, type: 'periodic' }, { unit_id: 1, type: 'periodic' }).ok).toBe(true);
  });
  it('호실 다르면 UNIT_MISMATCH', () => {
    const r = canCompare({ unit_id: 1, type: 'periodic' }, { unit_id: 2, type: 'periodic' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNIT_MISMATCH');
  });
  it('유형 다르면 TYPE_MISMATCH', () => {
    const r = canCompare({ unit_id: 1, type: 'periodic' }, { unit_id: 1, type: 'move_in' });
    expect(r.code).toBe('TYPE_MISMATCH');
  });
  it('수리 전↔수리 후는 예외 허용', () => {
    const r = canCompare({ unit_id: 1, type: 'repair_pre' }, { unit_id: 1, type: 'repair_post' });
    expect(r.ok).toBe(true);
    expect(r.isRepairBeforeAfter).toBe(true);
  });
  it('입주 전↔퇴거 전/후는 순서 상관없이 허용, isBaselinePair', () => {
    for (const [a, b] of [
      ['move_in', 'move_out_pre'],
      ['move_in', 'move_out_post'],
      ['move_out_post', 'move_in'],
    ]) {
      const r = canCompare({ unit_id: 1, type: a }, { unit_id: 1, type: b });
      expect(r.ok).toBe(true);
      expect(r.isBaselinePair).toBe(true);
    }
  });
  it('입주 전↔퇴거라도 호실 다르면 UNIT_MISMATCH', () => {
    const r = canCompare({ unit_id: 1, type: 'move_in' }, { unit_id: 2, type: 'move_out_post' });
    expect(r.code).toBe('UNIT_MISMATCH');
  });
  it('baseline 유형끼리라도 입주 전↔퇴거가 아니면 거부/비대상', () => {
    const r = canCompare({ unit_id: 1, type: 'move_out_pre' }, { unit_id: 1, type: 'move_out_post' });
    expect(r.code).toBe('TYPE_MISMATCH');
    const same = canCompare({ unit_id: 1, type: 'move_in' }, { unit_id: 1, type: 'move_in' });
    expect(same.ok).toBe(true);
    expect(same.isBaselinePair).toBe(false);
    expect(canCompare({ unit_id: 1, type: 'move_in' }, { unit_id: 1, type: 'repair_post' }).code).toBe(
      'TYPE_MISMATCH'
    );
  });
});

describe('GET /api/reports/compare', () => {
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
    const onUnit = (uid) => db.prepare('SELECT id FROM reports WHERE unit_id=? ORDER BY id').all(uid).map((r) => r.id);
    const moveInOf = (uid) => db.prepare("SELECT id FROM reports WHERE unit_id=? AND type='move_in' ORDER BY id").get(uid).id;
    ids = {
      contractor: idByName('이시공'),
      owner: idByName('김임대'),
      tenant: idByName('박임차'),
      r1234: onUnit(unit1234), // periodic 2개
      r345: moveInOf(unit345), // 345호 입주 전 1개 (id 3은 정기점검으로 바뀜)
      unit1234,
    };
  });

  const as = (req, userId) => req.set('x-user-id', String(userId));

  it('같은 호실+같은 유형 2개 비교 → 200, 두 snapshot 반환', async () => {
    const [a, b] = ids.r1234;
    const res = await as(request(app).get(`/api/reports/compare?leftId=${a}&rightId=${b}`), ids.owner);
    expect(res.status).toBe(200);
    expect(res.body.data.left.grade).toBeTruthy();
    expect(res.body.data.right.grade).toBeTruthy();
    expect(res.body.data.validation.ok).toBe(true);
    expect(res.body.data.compareMeta.sameType).toBe(true);
    expect(res.body.data.diff).toBeNull();
  });

  it('호실 다르면 400 UNIT_MISMATCH', async () => {
    const res = await as(
      request(app).get(`/api/reports/compare?leftId=${ids.r1234[0]}&rightId=${ids.r345}`),
      ids.owner
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNIT_MISMATCH');
  });

  it('동일 ID 2개면 400 COMPARE_SAME', async () => {
    const res = await as(
      request(app).get(`/api/reports/compare?leftId=${ids.r1234[0]}&rightId=${ids.r1234[0]}`),
      ids.owner
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMPARE_SAME');
  });

  it('파라미터 누락 시 400 VALIDATION', async () => {
    const res = await as(request(app).get(`/api/reports/compare?leftId=${ids.r1234[0]}`), ids.owner);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('없는 리포트면 404', async () => {
    const res = await as(request(app).get(`/api/reports/compare?leftId=${ids.r1234[0]}&rightId=99999`), ids.owner);
    expect(res.status).toBe(404);
  });

  it('접근 불가 리포트 포함 시 403 (tenant가 345 포함)', async () => {
    const res = await as(
      request(app).get(`/api/reports/compare?leftId=${ids.r1234[0]}&rightId=${ids.r345}`),
      ids.tenant
    );
    expect(res.status).toBe(403);
  });

  it('수리 전↔수리 후 예외 비교 → 200', async () => {
    // 같은 호실에 repair_pre / repair_post 점검을 만들고 제출
    const mkReport = async (type) => {
      const c = await as(request(app).post('/api/inspections'), ids.contractor).send({
        unitId: ids.unit1234,
        type,
        items: [{ name: '누수', state: 'repair' }],
        images: [{ dataBase64: 'AAAA', itemIndex: 0 }], // 수리 전·후는 항목별 사진 필수 (창 26)
      });
      const id = c.body.data.inspection.id;
      const s = await as(request(app).post(`/api/inspections/${id}/submit`), ids.contractor);
      return s.body.data.reportId;
    };
    const pre = await mkReport('repair_pre');
    const post = await mkReport('repair_post');

    const res = await as(
      request(app).get(`/api/reports/compare?leftId=${pre}&rightId=${post}`),
      ids.contractor
    );
    expect(res.status).toBe(200);
    expect(res.body.data.compareMeta.isRepairBeforeAfter).toBe(true);
    expect(res.body.data.validation.ok).toBe(true);
  });
  it('입주 전↔퇴거 후 비교 → 200 + diff(달라진 항목만), 좌우 순서 무관', async () => {
    const unit345 = db.prepare("SELECT id FROM units WHERE name='345호'").get().id;
    const c = await as(request(app).post('/api/inspections'), ids.contractor).send({
      unitId: unit345,
      type: 'move_out_post',
      items: [{ itemCode: 'LIVING_WALLPAPER', state: 'damaged' }],
      images: [{ dataBase64: 'AAAA', itemCode: 'LIVING_WALLPAPER' }],
      zonesConfirmed: ['현관', '주방', '화장실', '방1', '방2', '베란다'],
    });
    expect(c.status).toBe(201);
    const s = await as(request(app).post(`/api/inspections/${c.body.data.inspection.id}/submit`), ids.contractor);
    expect(s.status).toBe(201);
    const moveOut = s.body.data.reportId;

    for (const [l, r] of [
      [ids.r345, moveOut],
      [moveOut, ids.r345],
    ]) {
      const res = await as(request(app).get(`/api/reports/compare?leftId=${l}&rightId=${r}`), ids.owner);
      expect(res.status).toBe(200);
      expect(res.body.data.validation.isBaselinePair).toBe(true);
      expect(res.body.data.compareMeta.isBaselinePair).toBe(true);
      expect(res.body.data.left.reportId).toBe(l); // 기존 left/right 유지
      const { diff } = res.body.data;
      expect(diff.moveInReportId).toBe(ids.r345);
      expect(diff.moveOutReportId).toBe(moveOut);
      expect(diff.unchangedCount).toBe(39);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]).toMatchObject({
        itemCode: 'LIVING_WALLPAPER',
        from: 'normal',
        to: 'damaged',
        evidence: 'low', // 시드 입주 리포트는 작성자(author) 확인만 있다
      });
      expect(diff.changes[0].moveOutImages).toHaveLength(1);
    }
  });
});
