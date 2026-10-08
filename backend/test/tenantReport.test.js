import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { reportWindow, zoneStatus } from '../src/lib/tenantReport.js';
import { diffBaseline } from '../src/lib/diff.js';
import { ITEM_CATALOG, ZONES } from '../src/domain/itemCatalog.js';

describe('reportWindow (순수)', () => {
  const start = '2024-03-02';
  it('시작일부터 7일째 날까지 열려 있다', () => {
    expect(reportWindow(start, new Date(2024, 2, 2, 9))).toEqual({
      startDate: start,
      deadline: '2024-03-09',
      open: true,
      daysLeft: 7,
    });
    expect(reportWindow(start, new Date(2024, 2, 9, 23, 59))).toMatchObject({ open: true, daysLeft: 0 });
  });
  it('마감일 다음 날부터 닫힌다', () => {
    expect(reportWindow(start, new Date(2024, 2, 10, 0, 1))).toMatchObject({ open: false, daysLeft: -1 });
    expect(reportWindow('2024-02-28 10:00:00', new Date(2024, 2, 6))).toMatchObject({ deadline: '2024-03-06', open: true });
  });
});

describe('zoneStatus (순수)', () => {
  it('임차인 미확인 구역을 돌려준다', () => {
    const r = zoneStatus(['현관', '거실'], [
      { zone: '현관', role: 'author' },
      { zone: '현관', role: 'tenant' },
      { zone: '거실', role: 'author' },
    ]);
    expect(r.zones).toEqual([
      { zone: '현관', authorConfirmed: true, tenantConfirmed: true },
      { zone: '거실', authorConfirmed: true, tenantConfirmed: false },
    ]);
    expect(r.unconfirmedZones).toEqual(['거실']);
  });
});

describe('diffBaseline + 임차인 제보 (순수)', () => {
  const allAuthor = ZONES.map((zone) => ({ zone, role: 'author' }));
  const moveIn = { items: [], images: [], zoneConfirmations: allAuthor };
  const moveOut = {
    items: [
      { id: 1, item_code: 'BATHROOM_SILICONE', state: 'damaged' },
      { id: 2, item_code: 'LIVING_WALLPAPER', state: 'damaged' },
      { id: 3, item_code: 'KITCHEN_HOOD_FILTER', state: 'minor' },
    ],
    images: [],
    zoneConfirmations: allAuthor,
  };
  const tr = (id, itemCode, state, status, imageBase64 = null) => ({ id, itemCode, state, status, text: '제보', imageBase64 });
  const byCode = (r) => Object.fromEntries(r.changes.map((c) => [c.itemCode, c]));

  it('승인된 제보(화장실 실리콘 경미)는 입주 상태로 반영, 대기 제보는 무시', () => {
    const r = diffBaseline(moveIn, moveOut, ITEM_CATALOG, {
      tenantReports: [tr(1, 'BATHROOM_SILICONE', 'minor', 'approved'), tr(2, 'LIVING_WALLPAPER', 'minor', 'pending')],
    });
    const c = byCode(r);
    expect(c.BATHROOM_SILICONE).toMatchObject({ from: 'minor', to: 'damaged', evidence: 'mid', tenantReported: true, disputed: false });
    expect(c.LIVING_WALLPAPER).toMatchObject({ from: 'normal', evidence: 'low', tenantReported: false, disputed: false });
  });

  it('승인된 제보로 입주·퇴거 상태가 같아지면 변경에서 빠진다', () => {
    const r = diffBaseline(moveIn, moveOut, ITEM_CATALOG, { tenantReports: [tr(1, 'KITCHEN_HOOD_FILTER', 'minor', 'approved')] });
    expect(byCode(r).KITCHEN_HOOD_FILTER).toBeUndefined();
    expect(r.changes).toHaveLength(2);
  });

  it('제보 사진이 있으면 evidence high + moveInImages에 붙는다', () => {
    const r = diffBaseline(moveIn, moveOut, ITEM_CATALOG, {
      tenantReports: [tr(7, 'BATHROOM_SILICONE', 'minor', 'approved', 'data:image/png;base64,AAAA')],
    });
    const c = byCode(r).BATHROOM_SILICONE;
    expect(c.evidence).toBe('high');
    expect(c.moveInImages).toEqual([expect.objectContaining({ id: 'tenant-report-7', kind: 'tenant_report', data_base64: 'data:image/png;base64,AAAA' })]);
  });

  it('거절된 제보는 상태를 바꾸지 않고 disputed: true', () => {
    const r = diffBaseline(moveIn, moveOut, ITEM_CATALOG, { tenantReports: [tr(1, 'LIVING_WALLPAPER', 'minor', 'rejected')] });
    expect(byCode(r).LIVING_WALLPAPER).toMatchObject({ from: 'normal', to: 'damaged', disputed: true, tenantReported: false });
  });

  it('발행 뒤 임차인 구역 확인(tenantZones)도 evidence에 반영된다', () => {
    const noZones = { items: [], images: [], zoneConfirmations: [] };
    expect(byCode(diffBaseline(noZones, moveOut, ITEM_CATALOG)).LIVING_WALLPAPER).toMatchObject({ from: 'unknown', evidence: 'low' });
    const r = diffBaseline(noZones, moveOut, ITEM_CATALOG, { tenantZones: ['거실'] });
    expect(byCode(r).LIVING_WALLPAPER).toMatchObject({ from: 'normal', evidence: 'mid' });
  });
});

describe('임차인 입주 제보 API', () => {
  let db, ids, demo, clock;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const app = () => createApp(db, { now: () => clock });
  const inWindow = new Date(2024, 2, 5, 12); // 계약 시작 2024-03-02 → 마감 2024-03-09
  const afterWindow = new Date(2024, 2, 10, 9);
  const body = { itemCode: 'LIVING_WALLPAPER', state: 'minor', text: 'TV 벽면 얼룩' };

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    clock = inWindow;
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    const u1234 = db.prepare("SELECT id FROM units WHERE name = '1234호'").get().id;
    const reportOf = (type) =>
      db.prepare('SELECT id FROM reports WHERE unit_id = ? AND type = ? ORDER BY id DESC LIMIT 1').get(u1234, type).id;
    demo = { moveIn: reportOf('move_in'), moveOut: reportOf('move_out_post'), periodic: reportOf('periodic') };
  });

  const submitReport = (payload = body) =>
    request(app()).post(`/api/reports/${demo.moveIn}/tenant-reports`).set(as(ids.tenant)).send(payload);

  describe('제보 기간', () => {
    it('기간 안: 임차인 제보 → 201 pending', async () => {
      const res = await submitReport();
      expect(res.status).toBe(201);
      expect(res.body.data.tenantReport).toMatchObject({ itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', status: 'pending' });
    });

    it('기간이 지나면 400 "제보 기간이 끝났습니다" (제보·구역 확인 모두)', async () => {
      clock = afterWindow;
      const res = await submitReport();
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'REPORT_WINDOW_CLOSED', message: '제보 기간이 끝났습니다.' });
      const zone = await request(app()).post(`/api/reports/${demo.moveIn}/zone-confirm`).set(as(ids.tenant)).send({ zone: '베란다' });
      expect(zone.status).toBe(400);
      expect(zone.body.error.message).toBe('제보 기간이 끝났습니다.');
    });

    it('GET 목록에 기간·구역 확인 현황·제보가 온다', async () => {
      const res = await request(app()).get(`/api/reports/${demo.moveIn}/tenant-reports`).set(as(ids.owner));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.window).toEqual({ startDate: '2024-03-02', deadline: '2024-03-09', open: true, daysLeft: 4 });
      expect(d.unconfirmedZones).toEqual(['베란다']);
      expect(d.tenantReports.map((t) => [t.itemCode, t.status])).toEqual([
        ['ENTRANCE_SHOE_CABINET', 'approved'],
        ['ROOM1_DOOR', 'pending'],
      ]);
    });
  });

  describe('입력·권한', () => {
    it('잘못된 항목·상태·빈 내용 → 400', async () => {
      expect((await submitReport({ ...body, itemCode: 'NOPE' })).body.error.code).toBe('INVALID_ITEM_CODE');
      expect((await submitReport({ ...body, state: 'normal' })).body.error.code).toBe('INVALID_STATE');
      expect((await submitReport({ ...body, text: '  ' })).status).toBe(400);
    });

    it('임대인·시공업자는 제보할 수 없다 (403), 입주 리포트가 아니면 400', async () => {
      const post = (uid, reportId = demo.moveIn) =>
        request(app()).post(`/api/reports/${reportId}/tenant-reports`).set(as(uid)).send(body);
      expect((await post(ids.owner)).status).toBe(403);
      expect((await post(ids.contractor)).status).toBe(403);
      expect((await post(ids.tenant, demo.periodic)).body.error.code).toBe('NOT_MOVE_IN');
      const list = await request(app()).get(`/api/reports/${demo.moveIn}/tenant-reports`).set(as(ids.contractor));
      expect(list.status).toBe(403);
    });

    it('임차인 구역 확인 → zone_confirmations(role=tenant), 임대인은 403', async () => {
      const res = await request(app()).post(`/api/reports/${demo.moveIn}/zone-confirm`).set(as(ids.tenant)).send({ zone: '베란다' });
      expect(res.status).toBe(200);
      expect(res.body.data.unconfirmedZones).toEqual([]);
      const row = db
        .prepare("SELECT role FROM zone_confirmations zc JOIN reports r ON r.inspection_id = zc.inspection_id WHERE r.id = ? AND zc.zone = '베란다' AND zc.role = 'tenant'")
        .get(demo.moveIn);
      expect(row).toBeTruthy();
      const bad = await request(app()).post(`/api/reports/${demo.moveIn}/zone-confirm`).set(as(ids.tenant)).send({ zone: '다락' });
      expect(bad.body.error.code).toBe('INVALID_ZONE');
      const owner = await request(app()).post(`/api/reports/${demo.moveIn}/zone-confirm`).set(as(ids.owner)).send({ zone: '베란다' });
      expect(owner.status).toBe(403);
    });

    it('승인·거절은 그 호실 임대인만, 이미 처리된 제보는 400', async () => {
      const id = (await submitReport()).body.data.tenantReport.id;
      expect((await request(app()).post(`/api/tenant-reports/${id}/approve`).set(as(ids.tenant))).status).toBe(403);
      expect((await request(app()).post(`/api/tenant-reports/${id}/reject`).set(as(ids.contractor))).status).toBe(403);
      expect((await request(app()).post(`/api/tenant-reports/${id}/approve`)).status).toBe(401);

      const ok = await request(app()).post(`/api/tenant-reports/${id}/approve`).set(as(ids.owner));
      expect(ok.status).toBe(200);
      expect(ok.body.data.tenantReport.status).toBe('approved');
      expect(ok.body.data.tenantReport.decidedAt).toBeTruthy();

      const again = await request(app()).post(`/api/tenant-reports/${id}/reject`).set(as(ids.owner));
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe('ALREADY_DECIDED');
      expect((await request(app()).post('/api/tenant-reports/9999/approve').set(as(ids.owner))).status).toBe(404);
    });

    it('마감이 지나도 임대인은 대기 제보를 처리할 수 있다', async () => {
      clock = afterWindow;
      const pending = db.prepare("SELECT id FROM tenant_reports WHERE status = 'pending'").get().id;
      const res = await request(app()).post(`/api/tenant-reports/${pending}/approve`).set(as(ids.owner));
      expect(res.status).toBe(200);
    });
  });

  describe('비교 diff 반영', () => {
    const compare = () =>
      request(app()).get(`/api/reports/compare?leftId=${demo.moveIn}&rightId=${demo.moveOut}`).set(as(ids.owner));
    const changeOf = async (code) => (await compare()).body.data.diff.changes.find((c) => c.itemCode === code);

    it('승인 → 입주 상태 반영, 거절 → disputed: true, 대기 → 그대로', async () => {
      const screen = (await submitReport({ itemCode: 'BALCONY_SCREEN', state: 'minor', text: '방충망 모서리 들뜸' })).body.data.tenantReport.id;
      const wall = (await submitReport()).body.data.tenantReport.id;

      expect(await changeOf('BALCONY_SCREEN')).toMatchObject({ from: 'normal', evidence: 'low', tenantReported: false });

      await request(app()).post(`/api/tenant-reports/${screen}/approve`).set(as(ids.owner));
      await request(app()).post(`/api/tenant-reports/${wall}/reject`).set(as(ids.owner));

      expect(await changeOf('BALCONY_SCREEN')).toMatchObject({ from: 'minor', to: 'damaged', evidence: 'mid', tenantReported: true });
      expect(await changeOf('LIVING_WALLPAPER')).toMatchObject({ from: 'normal', to: 'damaged', disputed: true });
    });

    it('시드 제보(신발장 승인·방1 문 대기)는 시연 diff 4건을 바꾸지 않는다', async () => {
      const { diff } = (await compare()).body.data;
      expect(diff.changes.map((c) => [c.itemCode, c.from, c.evidence, c.disputed])).toEqual([
        ['LIVING_WALLPAPER', 'normal', 'high', false],
        ['KITCHEN_HOOD_FILTER', 'normal', 'high', false],
        ['BATHROOM_SILICONE', 'minor', 'mid', false],
        ['BALCONY_SCREEN', 'normal', 'low', false],
      ]);
    });
  });
});
