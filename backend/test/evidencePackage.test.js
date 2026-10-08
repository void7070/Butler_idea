import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { buildEvidencePackage, basisView, zoneConfirmationTable, EVIDENCE_NOTICE } from '../src/lib/evidencePackage.js';

describe('evidencePackage (순수)', () => {
  it('basisView: 특약 원문 / 표준 계산식 / 임대인·보류 설명', () => {
    const clause = basisView(
      {
        payer: 'tenant',
        estimateCost: 480000,
        tenantAmount: 480000,
        basis: { type: 'clause', clauseNo: 3, stdAmount: 320000, clause: { title: '도배', text: '특약 원문' } },
      },
      24
    );
    expect(clause).toMatchObject({ type: 'clause', clauseNo: 3, title: '도배', text: '특약 원문' });
    expect(clause.formula).toContain('320,000원');

    const std = basisView(
      { payer: 'tenant', estimateCost: 150000, tenantAmount: 90000, lifespanYears: 5, basis: { type: 'standard', residual: 0.6 } },
      24
    );
    expect(std.type).toBe('standard');
    expect(std.formula).toBe('표준 기준 · 견적 150,000원 × 잔존 60% (1 − 경과 24개월 ÷ (내구연수 5년 × 12)) = 90,000원');

    expect(basisView({ payer: 'landlord', basis: null }, 24).type).toBe('none');
    expect(basisView({ payer: 'hold', basis: null }, 24).formula).toContain('보류');
  });

  it('zoneConfirmationTable: 구역 순서대로 작성자·임차인 확인', () => {
    const t = zoneConfirmationTable(
      ['거실', '베란다'],
      [
        { zone: '거실', role: 'author' },
        { zone: '거실', role: 'tenant', confirmed_at: '2024-03-02 10:00:00' },
        { zone: '베란다', role: 'author' },
      ]
    );
    expect(t).toEqual([
      { zone: '거실', author: true, tenant: true, tenantConfirmedAt: '2024-03-02 10:00:00' },
      { zone: '베란다', author: true, tenant: false, tenantConfirmedAt: null },
    ]);
  });

  it('조립: 항목 금액·사진·응답, 제보 승인/거절 분리, 링크·무결성', () => {
    const now = new Date('2026-09-27T01:00:00.000Z');
    const pkg = buildEvidencePackage({
      settlement: {
        id: 1,
        unitId: 1,
        unitName: '1234호',
        moveInReportId: 4,
        moveOutReportId: 5,
        status: 'hold',
        elapsedMonths: 24,
        items: [
          {
            itemCode: 'W',
            zone: '거실',
            name: '벽지',
            payer: 'tenant',
            tenantAmount: 480000,
            basis: { type: 'clause', clauseNo: 3, stdAmount: 320000, clause: { text: '원문' } },
            tenantResponse: 'object',
            tenantResponseText: '입주 때부터',
            tenantResponseImage: 'data:img',
            tenantRespondedAt: '2026-09-26T09:00:00.000Z',
          },
          { itemCode: 'S', zone: '베란다', name: '방충망', payer: 'landlord', landlordAmount: 45000, basis: null },
        ],
        fees: [{ clauseNo: 4, amount: 200000 }],
        manualClauses: [{ clauseNo: 6, text: '기타 파손은 협의' }],
        totals: { tenantTotal: 680000 },
      },
      moveInSnapshot: { generatedAt: '2024-03-02 10:00:00', unit: { name: '1234호' }, zoneConfirmations: [] },
      moveOutSnapshot: { generatedAt: '2026-03-02 10:00:00' },
      tenantReports: [
        { id: 1, status: 'approved', text: 'a' },
        { id: 2, status: 'rejected', text: 'b', imageBase64: 'data:x' },
        { id: 3, status: 'pending' },
      ],
      changes: [{ itemCode: 'W', moveInImages: [{ id: 1 }], moveOutImages: [{ id: 2 }] }],
      zones: ['거실'],
      link: { createdAt: 'c', firstViewedAt: null, expiresAt: 'e', token: 'secret' },
      integrity: { moveIn: { ok: true }, moveOut: { ok: true }, settlement: null },
      now,
    });

    expect(pkg.generatedAt).toBe(now.toISOString());
    expect(pkg.notice).toBe(EVIDENCE_NOTICE);
    expect(pkg.baseline).toMatchObject({ reportId: 4, date: '2024-03-02', pendingTenantReportCount: 1 });
    expect(pkg.baseline.approvedTenantReports.map((r) => r.id)).toEqual([1]);
    expect(pkg.baseline.rejectedTenantReports[0]).toMatchObject({ id: 2, image: 'data:x' });
    expect(pkg.moveOut).toMatchObject({ reportId: 5, date: '2026-03-02' });
    const [wall, screen] = pkg.items;
    expect(wall).toMatchObject({ amount: 480000, moveInImages: [{ id: 1 }], moveOutImages: [{ id: 2 }] });
    expect(wall.tenantResponse).toEqual({ response: 'object', text: '입주 때부터', image: 'data:img', respondedAt: '2026-09-26T09:00:00.000Z' });
    expect(screen).toMatchObject({ amount: 45000, moveInImages: [], tenantResponse: null });
    expect(pkg.link).toEqual({ createdAt: 'c', firstViewedAt: null, expiresAt: 'e' }); // 토큰은 넣지 않는다
    expect(pkg.integrity).toMatchObject({ moveIn: { ok: true }, settlement: null, verifiedAt: now.toISOString() });
    expect(pkg.lease).toBeNull();
  });
});

describe('GET /api/settlements/:id/evidence (창 19)', () => {
  let db, app, ids, settlementId;
  const NOW = '2026-09-26T09:00:00.000Z';
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const evidence = (uid = ids.owner) => request(app).get(`/api/settlements/${settlementId}/evidence`).set(as(uid));
  const share = async () =>
    (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;
  const respond = (token, body) => request(app).post(`/api/share/settlement/${token}/respond`).send(body);
  const item = (pkg, code) => pkg.items.find((it) => it.itemCode === code);

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(NOW) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
  });

  it('확정 전(draft): 계약·특약, 입주 기준선, 항목 근거·사진, 리포트 무결성, 정산 검증 null', async () => {
    const res = await evidence();
    expect(res.status).toBe(200);
    const pkg = res.body.data.evidence;

    expect(pkg.generatedAt).toBe(NOW);
    expect(pkg.settlement).toMatchObject({ status: 'draft', frozen: false, elapsedMonths: 24 });
    expect(pkg.unit.name).toBe('1234호');
    expect(pkg.lease).toMatchObject({ range: '2024-03-02 ~ 2026-03-02', deposit: 50_000_000, tenantName: '박임차' });
    expect(pkg.lease.clauses.map((c) => c.clauseNo)).toEqual([3, 4, 6]);
    expect(pkg.lease.clauses.find((c) => c.clauseNo === 6).applyLabel).toBe('수동 확인 필요');

    expect(pkg.baseline.zoneConfirmations).toHaveLength(7);
    expect(pkg.baseline.zoneConfirmations.find((z) => z.zone === '베란다')).toMatchObject({ author: true, tenant: false });
    expect(pkg.baseline.approvedTenantReports.map((r) => r.itemCode)).toEqual(['ENTRANCE_SHOE_CABINET']);
    expect(pkg.baseline.rejectedTenantReports).toEqual([]);

    const wall = item(pkg, 'LIVING_WALLPAPER');
    expect(wall).toMatchObject({ payer: 'tenant', amount: 480000, evidence: 'high' });
    expect(wall.basis).toMatchObject({ type: 'clause', clauseNo: 3 });
    expect(wall.basis.text).toBeTruthy();
    expect(wall.moveOutImages.length).toBe(1);
    expect(item(pkg, 'BATHROOM_SILICONE').basis.type).toBe('standard');
    expect(item(pkg, 'BALCONY_SCREEN').payer).toBe('hold');
    expect(pkg.fees.map((f) => f.clauseNo)).toEqual([4]);
    expect(pkg.manualClauses.map((c) => c.clauseNo)).toEqual([6]);

    expect(pkg.link).toBeNull();
    expect(pkg.integrity.moveIn.ok).toBe(true);
    expect(pkg.integrity.moveOut.ok).toBe(true);
    expect(pkg.integrity.settlement).toBeNull();
  });

  it('보류(hold): 이의 내용·사진·시각과 링크 기록이 들어간다', async () => {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    const token = await share();
    await request(app).get(`/api/share/settlement/${token}`); // 최초 열람
    await respond(token, { itemCode: 'LIVING_WALLPAPER', response: 'object', text: '입주 때부터 얼룩', image: 'data:image/png;base64,AAAA' });
    await respond(token, { itemCode: 'BATHROOM_SILICONE', response: 'agree' });

    const pkg = (await evidence()).body.data.evidence;
    expect(pkg.settlement.status).toBe('hold');
    expect(item(pkg, 'LIVING_WALLPAPER').tenantResponse).toEqual({
      response: 'object',
      text: '입주 때부터 얼룩',
      image: 'data:image/png;base64,AAAA',
      respondedAt: NOW,
    });
    expect(item(pkg, 'BATHROOM_SILICONE').tenantResponse.response).toBe('agree');
    expect(pkg.link).toMatchObject({ createdAt: NOW, firstViewedAt: NOW });
    expect(pkg.link.expiresAt).toBeTruthy();
    expect(pkg.link.token).toBeUndefined();
  });

  it('확정 후: 정산서 스냅샷 기준(뒤의 DB 변경 무시) + 정산서 무결성, 변조하면 ok=false', async () => {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    const token = await share();
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) await respond(token, { itemCode, response: 'agree' });
    expect((await request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner))).status).toBe(200);

    db.prepare("UPDATE settlement_items SET estimate_cost = 999000 WHERE item_code = 'LIVING_WALLPAPER'").run();

    const pkg = (await evidence()).body.data.evidence;
    expect(pkg.settlement).toMatchObject({ status: 'confirmed', frozen: true, confirmedAt: NOW });
    expect(pkg.totals).toMatchObject({ tenantTotal: 770000, landlordTotal: 105000, depositReturn: 49230000 });
    expect(item(pkg, 'LIVING_WALLPAPER').amount).toBe(480000);
    expect(item(pkg, 'BALCONY_SCREEN')).toMatchObject({ payer: 'landlord', amount: 45000 });
    expect(pkg.integrity.settlement).toMatchObject({ ok: true, confirmedAt: NOW });

    const snap = db.prepare('SELECT snapshot_json FROM settlement_snapshots WHERE settlement_id = ?').get(settlementId);
    const tampered = JSON.parse(snap.snapshot_json);
    tampered.totals.tenantTotal = 670000;
    db.prepare('UPDATE settlement_snapshots SET snapshot_json = ? WHERE settlement_id = ?').run(JSON.stringify(tampered), settlementId);
    expect((await evidence()).body.data.evidence.integrity.settlement.ok).toBe(false);
  });

  it('리포트 스냅샷을 변조하면 그 리포트의 무결성 ok=false', async () => {
    const moveOutId = db.prepare('SELECT move_out_report_id AS id FROM settlements WHERE id = ?').get(settlementId).id;
    db.prepare("UPDATE report_snapshots SET snapshot_json = snapshot_json || ' ' WHERE report_id = ?").run(moveOutId);
    const pkg = (await evidence()).body.data.evidence;
    expect(pkg.integrity.moveOut.ok).toBe(false);
    expect(pkg.integrity.moveIn.ok).toBe(true);
  });

  it('권한: 임차인·시공업자 403, 사용자 없음 401, 없는 정산 404', async () => {
    expect((await evidence(ids.tenant)).status).toBe(403);
    expect((await evidence(ids.contractor)).status).toBe(403);
    expect((await request(app).get(`/api/settlements/${settlementId}/evidence`)).status).toBe(401);
    expect((await request(app).get('/api/settlements/9999/evidence').set(as(ids.owner))).status).toBe(404);
  });
});
