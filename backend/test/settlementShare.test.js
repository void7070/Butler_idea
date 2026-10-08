import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import {
  shareExpiresAt,
  isShareExpired,
  normalizeTenantResponse,
  settlementStatus,
  confirmCheck,
  assertEditableAfterResponse,
} from '../src/lib/settlementShare.js';

describe('settlementShare (순수)', () => {
  it('공유 링크는 7일 뒤 만료 (만료 시각 정각부터)', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const exp = shareExpiresAt(now);
    expect(exp).toBe('2026-10-03T00:00:00.000Z');
    expect(isShareExpired(exp, new Date('2026-10-02T23:59:59Z'))).toBe(false);
    expect(isShareExpired(exp, new Date('2026-10-03T00:00:00Z'))).toBe(true);
    expect(isShareExpired(null, now)).toBe(true);
  });

  it('응답 검증: 이의는 내용 필수, 동의는 사진을 버린다', () => {
    expect(() => normalizeTenantResponse({ itemCode: 'X', response: 'maybe' })).toThrow(/agree/);
    expect(() => normalizeTenantResponse({ itemCode: 'X', response: 'object', text: '  ' })).toThrow(/이의 내용/);
    expect(normalizeTenantResponse({ itemCode: 'X', response: 'agree', image: 'data:x' })).toEqual({
      itemCode: 'X',
      response: 'agree',
      text: null,
      image: null,
    });
  });

  it('상태: 임차인 부담 항목에 이의가 있으면 hold, 임대인 부담으로 돌리면 draft', () => {
    const items = [
      { itemCode: 'A', payer: 'tenant', tenantResponse: 'object' },
      { itemCode: 'B', payer: 'tenant', tenantResponse: 'agree' },
    ];
    expect(settlementStatus('draft', items)).toBe('hold');
    expect(settlementStatus('hold', [{ ...items[0], payer: 'landlord' }, items[1]])).toBe('draft');
    expect(settlementStatus('confirmed', items)).toBe('confirmed');
  });

  it('확정 조건: 이의·보류·무응답이 없어야 한다', () => {
    expect(confirmCheck([{ itemCode: 'A', payer: 'tenant', tenantResponse: 'object' }]).code).toBe('SETTLEMENT_ON_HOLD');
    expect(confirmCheck([{ itemCode: 'A', payer: 'hold', tenantResponse: null }]).code).toBe('ITEMS_ON_HOLD');
    expect(confirmCheck([{ itemCode: 'A', payer: 'tenant', tenantResponse: null }]).code).toBe('NOT_ALL_AGREED');
    expect(
      confirmCheck([
        { itemCode: 'A', payer: 'tenant', tenantResponse: 'agree' },
        { itemCode: 'B', payer: 'landlord', tenantResponse: 'object' },
      ]).ok
    ).toBe(true);
  });

  it('응답한 항목은 임대인 부담으로 돌리기만 허용', () => {
    const item = { tenantResponse: 'object' };
    expect(() => assertEditableAfterResponse(item, { payer: 'landlord' })).not.toThrow();
    expect(() => assertEditableAfterResponse(item, { estimateCost: 1 })).toThrow(/임대인 부담으로 돌리기/);
    expect(() => assertEditableAfterResponse(item, { payer: 'hold' })).toThrow();
    expect(() => assertEditableAfterResponse({ tenantResponse: null }, { estimateCost: 1 })).not.toThrow();
  });
});

describe('정산 링크 API (창 11)', () => {
  let db, app, ids, settlementId, clock;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    clock = new Date('2026-09-26T09:00:00Z');
    app = createApp(db, { aiComplete: async () => '{}', now: () => clock });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id; // 시연 정산 (1234호)
  });

  const share = async () => {
    const res = await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner));
    expect(res.status).toBe(201);
    return res.body.data;
  };
  const respond = (token, body) => request(app).post(`/api/share/settlement/${token}/respond`).send(body);
  const confirm = () => request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner));
  const status = () => db.prepare('SELECT status FROM settlements WHERE id = ?').get(settlementId).status;

  it('링크 생성: 임대인만, 7일 만료 + 모의 알림 문구(발송 없음)', async () => {
    const data = await share();
    expect(data.path).toBe(`/share/settlement/${data.token}`);
    expect(data.expiresAt).toBe('2026-10-03T09:00:00.000Z');
    expect(data.sent).toBe(false);
    expect(data.message).toContain('1234호');
    for (const uid of [ids.tenant, ids.contractor]) {
      expect((await request(app).post(`/api/settlements/${settlementId}/share`).set(as(uid))).status).toBe(403);
    }
  });

  it('링크 조회: 임차인 부담 항목만 + 특약 원문, 최초 열람 시각은 한 번만 기록', async () => {
    const { token } = await share();
    const first = await request(app).get(`/api/share/settlement/${token}`);
    expect(first.status).toBe(200);
    const s = first.body.data.settlement;
    expect(s.items.map((it) => it.itemCode).sort()).toEqual(['BATHROOM_SILICONE', 'LIVING_WALLPAPER']);
    const wall = s.items.find((it) => it.itemCode === 'LIVING_WALLPAPER');
    expect(wall.tenantAmount).toBe(480000);
    expect(wall.basis.clause).toMatchObject({ clauseNo: 3 });
    expect(wall.basis.clause.text).toBeTruthy();
    expect(s.items.find((it) => it.itemCode === 'BATHROOM_SILICONE').basis).toMatchObject({ type: 'standard', residual: 0.6 });
    expect(s.fees[0]).toMatchObject({ clauseNo: 4, amount: 200000 });
    expect(s.totals.tenantTotal).toBe(770000);
    expect(s.totals).not.toHaveProperty('landlordTotal');
    expect(first.body.data.link.firstViewedAt).toBe('2026-09-26T09:00:00.000Z');

    clock = new Date(clock.getTime() + 60 * 60 * 1000);
    const again = await request(app).get(`/api/share/settlement/${token}`);
    expect(again.body.data.link.firstViewedAt).toBe('2026-09-26T09:00:00.000Z');
    // 임대인 화면에도 열람 시각이 보인다
    const owner = await request(app).get(`/api/settlements/${settlementId}`).set(as(ids.owner));
    expect(owner.body.data.settlement.shareLink).toMatchObject({ firstViewedAt: '2026-09-26T09:00:00.000Z', expired: false });
  });

  it('만료: 7일 뒤 조회·응답 모두 410, 없는 토큰은 404', async () => {
    const { token } = await share();
    clock = new Date(clock.getTime() + 7 * DAY);
    expect((await request(app).get(`/api/share/settlement/${token}`)).status).toBe(410);
    const r = await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'agree' });
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('SHARE_LINK_EXPIRED');
    expect((await request(app).get('/api/share/settlement/nope')).status).toBe(404);
  });

  it('리포트 공유 링크도 7일 뒤 만료 (410)', async () => {
    const reportId = db.prepare('SELECT id FROM reports ORDER BY id LIMIT 1').get().id;
    const created = await request(app).post(`/api/reports/${reportId}/share`).set(as(ids.owner));
    expect(created.body.data.expiresAt).toBe('2026-10-03T09:00:00.000Z');
    const token = created.body.data.token;
    clock = new Date(clock.getTime() + 7 * DAY - 1000);
    expect((await request(app).get(`/api/share/${token}`)).status).toBe(200);
    clock = new Date(clock.getTime() + 1000);
    expect((await request(app).get(`/api/share/${token}`)).status).toBe(410);
  });

  it('권한 없는 수정 차단: 링크로는 응답만, 응답은 한 번(수정 불가), 임차인 부담이 아닌 항목 불가, 임차인은 정산 수정·확정 불가', async () => {
    const { token } = await share();
    const ok = await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'agree' });
    expect(ok.status).toBe(200);
    const twice = await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'object', text: '바꿀래요' });
    expect(twice.status).toBe(400);
    expect(twice.body.error.code).toBe('ALREADY_RESPONDED');
    const notCharged = await respond(token, { itemCode: 'KITCHEN_HOOD_FILTER', response: 'agree' });
    expect(notCharged.body.error.code).toBe('NOT_CHARGED');

    // 링크 토큰으로 정산 수정 경로는 없다 / 헤더 없는 정산 수정은 401 / 임차인은 403
    expect((await request(app).patch(`/api/share/settlement/${token}/items/LIVING_WALLPAPER`).send({ payer: 'landlord' })).status).toBe(404);
    expect((await request(app).delete(`/api/share/settlement/${token}/respond`)).status).toBe(404);
    expect((await request(app).patch(`/api/settlements/${settlementId}/items/LIVING_WALLPAPER`).send({ payer: 'landlord' })).status).toBe(401);
    expect(
      (await request(app).patch(`/api/settlements/${settlementId}/items/LIVING_WALLPAPER`).set(as(ids.tenant)).send({ payer: 'landlord' })).status
    ).toBe(403);
    expect((await request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.tenant))).status).toBe(403);

    // 임대인도 응답한 항목의 견적은 못 바꾼다 (임대인 부담으로 돌리기만)
    const cost = await request(app).patch(`/api/settlements/${settlementId}/items/LIVING_WALLPAPER`).set(as(ids.owner)).send({ estimateCost: 1 });
    expect(cost.body.error.code).toBe('ITEM_RESPONDED');
  });

  it('이의 → hold → 확정 400 → 임대인 부담으로 돌리기 → 보류 해제', async () => {
    const { token } = await share();
    const obj = await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'object', text: '입주 때부터 얼룩', image: 'data:image/png;base64,AAAA' });
    expect(obj.status).toBe(200);
    expect(obj.body.data.settlement.status).toBe('hold');
    const wall = obj.body.data.settlement.items.find((it) => it.itemCode === 'LIVING_WALLPAPER');
    expect(wall.response).toMatchObject({ response: 'object', text: '입주 때부터 얼룩', respondedAt: '2026-09-26T09:00:00.000Z' });
    expect(status()).toBe('hold');

    const c = await confirm();
    expect(c.status).toBe(400);
    expect(c.body.error.code).toBe('SETTLEMENT_ON_HOLD');

    const owner = (await request(app).get(`/api/settlements/${settlementId}`).set(as(ids.owner))).body.data.settlement;
    expect(owner.items.find((it) => it.itemCode === 'LIVING_WALLPAPER')).toMatchObject({
      tenantResponse: 'object',
      tenantResponseText: '입주 때부터 얼룩',
    });

    const moved = await request(app).patch(`/api/settlements/${settlementId}/items/LIVING_WALLPAPER`).set(as(ids.owner)).send({ payer: 'landlord' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.settlement.status).toBe('draft');
    // 이의 기록은 남는다
    expect(moved.body.data.settlement.items.find((it) => it.itemCode === 'LIVING_WALLPAPER').tenantResponse).toBe('object');
  });

  it('보류·무응답 항목이 있으면 확정 400, 모든 청구 항목 동의 → 확정 성공, 이후 수정·응답 불가', async () => {
    const { token } = await share();
    expect((await confirm()).body.error.code).toBe('ITEMS_ON_HOLD'); // 방충망 보류
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});

    await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'agree' });
    const partial = await confirm();
    expect(partial.body.error.code).toBe('NOT_ALL_AGREED');

    await respond(token, { itemCode: 'BATHROOM_SILICONE', response: 'agree', text: '확인했습니다' });
    const done = await confirm();
    expect(done.status).toBe(200);
    expect(done.body.data.settlement).toMatchObject({ status: 'confirmed', confirmedAt: '2026-09-26T09:00:00.000Z' });
    expect(done.body.data.settlement.totals.tenantTotal).toBe(770000);

    expect((await confirm()).body.error.code).toBe('SETTLEMENT_CONFIRMED');
    expect((await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'object', text: 'x' })).body.error.code).toBe('SETTLEMENT_CONFIRMED');
    expect((await request(app).get(`/api/share/settlement/${token}`)).body.data.settlement.status).toBe('confirmed');
  });
});
