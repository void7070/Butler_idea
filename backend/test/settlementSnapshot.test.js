import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { hashSnapshot } from '../src/lib/snapshotHash.js';

describe('확정 정산서 동결과 해시 (창 15)', () => {
  let db, app, ids, settlementId, token;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const CONFIRMED_AT = '2026-09-26T09:00:00.000Z';

  const get = (uid) => request(app).get(`/api/settlements/${settlementId}`).set(as(uid));
  const verify = (uid) => request(app).get(`/api/settlements/${settlementId}/verify`).set(as(uid));
  const snapshotRow = () => db.prepare('SELECT * FROM settlement_snapshots WHERE settlement_id = ?').get(settlementId);

  /** 시연 순서: 소액 일괄 → 링크 → 두 항목 동의 → 합의 확정 */
  async function confirmDemo() {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    token = (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response: 'agree' });
    }
    return request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner));
  }

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(CONFIRMED_AT) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
  });

  it('확정 전에는 스냅샷이 없고 verify는 400, 링크 조회의 verify는 null', async () => {
    expect(snapshotRow()).toBeUndefined();
    expect((await get(ids.owner)).body.data.settlement.frozen).toBe(false);
    expect((await verify(ids.owner)).body.error.code).toBe('SETTLEMENT_NOT_CONFIRMED');
    token = (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;
    expect((await request(app).get(`/api/share/settlement/${token}`)).body.data.verify).toBeNull();
  });

  it('확정 시 계산 결과를 스냅샷 + SHA-256으로 저장하고 조회는 그것을 돌려준다', async () => {
    const c = await confirmDemo();
    expect(c.status).toBe(200);

    const snap = snapshotRow();
    expect(snap.snapshot_hash).toBe(hashSnapshot(snap.snapshot_json));
    const frozen = JSON.parse(snap.snapshot_json);
    expect(frozen).toMatchObject({ status: 'confirmed', confirmedAt: CONFIRMED_AT, unitName: '1234호' });
    expect(frozen.totals).toMatchObject({ tenantTotal: 770000, landlordTotal: 105000, depositReturn: 49230000 });
    const wall = frozen.items.find((it) => it.itemCode === 'LIVING_WALLPAPER');
    expect(wall).toMatchObject({ tenantAmount: 480000, tenantResponse: 'agree' });
    expect(wall.basis.clause.text).toBeTruthy(); // 특약 원문도 동결
    expect(frozen.shareLink).toBeUndefined(); // 링크는 동결 대상이 아님

    const s = (await get(ids.owner)).body.data.settlement;
    expect(s).toMatchObject({ frozen: true, status: 'confirmed', totals: frozen.totals });
    expect(s.shareLink.token).toBe(token);
    expect(c.body.data.settlement.frozen).toBe(true);
  });

  it('확정 뒤 DB에서 견적·부담자·특약을 바꿔도 조회 결과는 그대로', async () => {
    await confirmDemo();
    const before = (await get(ids.owner)).body.data.settlement;
    const shareBefore = (await request(app).get(`/api/share/settlement/${token}`)).body.data.settlement;

    db.prepare("UPDATE settlement_items SET estimate_cost = 999000 WHERE item_code = 'LIVING_WALLPAPER'").run();
    db.prepare("UPDATE settlement_items SET payer = 'tenant' WHERE item_code = 'KITCHEN_HOOD_FILTER'").run();
    db.prepare("UPDATE lease_clauses SET text = '바뀐 특약'").run();

    const after = (await get(ids.owner)).body.data.settlement;
    expect(after.items).toEqual(before.items);
    expect(after.totals).toEqual(before.totals);
    expect(after.totals.tenantTotal).toBe(770000);
    const shareAfter = (await request(app).get(`/api/share/settlement/${token}`)).body.data.settlement;
    expect(shareAfter).toEqual(shareBefore);
    expect((await verify(ids.owner)).body.data.ok).toBe(true);
  });

  it('스냅샷을 고치면 verify ok=false (정산 화면·링크 모두), 되돌리면 ok', async () => {
    await confirmDemo();
    const ok = (await verify(ids.owner)).body.data;
    expect(ok).toMatchObject({ ok: true, confirmedAt: CONFIRMED_AT });
    expect(ok.currentHash).toBe(ok.storedHash);

    const original = snapshotRow().snapshot_json;
    const tampered = JSON.parse(original);
    tampered.totals.tenantTotal = 670000;
    db.prepare('UPDATE settlement_snapshots SET snapshot_json = ? WHERE settlement_id = ?').run(JSON.stringify(tampered), settlementId);

    const bad = (await verify(ids.owner)).body.data;
    expect(bad.ok).toBe(false);
    expect(bad.storedHash).toBe(ok.storedHash);
    const share = (await request(app).get(`/api/share/settlement/${token}`)).body.data;
    expect(share.verify.ok).toBe(false);
    expect(share.settlement.totals.tenantTotal).toBe(670000); // 스냅샷을 그대로 보여 준다

    db.prepare('UPDATE settlement_snapshots SET snapshot_json = ? WHERE settlement_id = ?').run(original, settlementId);
    expect((await verify(ids.owner)).body.data.ok).toBe(true);
  });

  it('권한: 그 호실 임대인·임차인만 verify, 시공업자 403, 사용자 없음 401', async () => {
    await confirmDemo();
    expect((await verify(ids.tenant)).body.data.ok).toBe(true);
    expect((await verify(ids.contractor)).status).toBe(403);
    expect((await request(app).get(`/api/settlements/${settlementId}/verify`)).status).toBe(401);
    expect((await request(app).get('/api/settlements/9999/verify').set(as(ids.owner))).status).toBe(404);
  });
});
