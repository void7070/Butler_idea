import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import {
  buildRepairLedger,
  ledgerReason,
  ledgerTotals,
  toCsv,
  csvCell,
  parseLedgerFilter,
  REASONS,
} from '../src/lib/repairLedger.js';

const item = (over) => ({
  itemCode: 'X',
  zone: '거실',
  name: '벽지',
  payer: 'landlord',
  defaultPayer: 'tenant',
  payerSource: null,
  tenantResponse: null,
  landlordAmount: 10000,
  ...over,
});
const snap = (id, unitId, unitName, confirmedAt, items, status = 'confirmed') => ({
  id,
  unitId,
  unitName,
  status,
  confirmedAt,
  items,
});

describe('수선비 장부 순수 로직 (창 16)', () => {
  it('사유: 이의 → 소액 일괄 → 자연 마모 후보 → 임대인 선택', () => {
    expect(ledgerReason(item({ tenantResponse: 'object', payerSource: 'manual' }))).toBe(REASONS.objection);
    expect(ledgerReason(item({ payerSource: 'bulk_small', defaultPayer: 'landlord' }))).toBe(REASONS.smallBulk);
    expect(ledgerReason(item({ defaultPayer: 'landlord' }))).toBe(REASONS.naturalWear);
    expect(ledgerReason(item({ defaultPayer: 'landlord', payerSource: 'manual' }))).toBe(REASONS.manual);
    expect(ledgerReason(item({ defaultPayer: 'hold', payerSource: 'manual' }))).toBe(REASONS.manual);
    expect(ledgerReason(item({ defaultPayer: 'tenant', payerSource: undefined }))).toBe(REASONS.manual); // 옛 스냅샷
  });

  it('확정 스냅샷의 임대인 항목만 합계, 확정 전은 예정(합계 제외)', () => {
    const ledger = buildRepairLedger({
      confirmed: [
        {
          snapshot: snap(1, 1, '1234호', '2026-03-10T03:00:00.000Z', [
            item({ itemCode: 'A', landlordAmount: 60000, defaultPayer: 'landlord' }),
            item({ itemCode: 'B', payer: 'tenant', landlordAmount: 0 }),
            item({ itemCode: 'C', payer: 'hold', landlordAmount: 0 }),
          ]),
          hashOk: true,
        },
      ],
      drafts: [snap(2, 2, '345호', null, [item({ itemCode: 'D', landlordAmount: 30000 })], 'hold')],
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      date: '2026-03-10',
      unitName: '1234호',
      itemName: '벽지',
      amount: 60000,
      source: 'settlement',
      settlementId: 1,
      reason: REASONS.naturalWear,
      hashOk: true,
    });
    expect(ledger.pending).toEqual([expect.objectContaining({ itemCode: 'D', amount: 30000, status: 'hold', date: null })]);
    expect(ledger.totals.total).toBe(60000);
  });

  it('연도·호실 필터와 호실별·연도별 합계', () => {
    const confirmed = [
      { snapshot: snap(1, 1, '1234호', '2025-05-01T03:00:00.000Z', [item({ landlordAmount: 10000 })]), hashOk: true },
      { snapshot: snap(2, 1, '1234호', '2026-05-01T03:00:00.000Z', [item({ landlordAmount: 20000 })]), hashOk: true },
      { snapshot: snap(3, 2, '345호', '2026-06-01T03:00:00.000Z', [item({ landlordAmount: 40000 })]), hashOk: false },
    ];
    const drafts = [snap(4, 2, '345호', null, [item({ landlordAmount: 5000 })], 'draft')];

    const all = buildRepairLedger({ confirmed, drafts });
    expect(all.years).toEqual([2026, 2025]);
    expect(all.totals).toEqual({
      byUnit: [
        { unitId: 1, unitName: '1234호', total: 30000, count: 2 },
        { unitId: 2, unitName: '345호', total: 40000, count: 1 },
      ],
      byYear: [
        { year: 2025, total: 10000, count: 1 },
        { year: 2026, total: 60000, count: 2 },
      ],
      total: 70000,
    });

    const y2026 = buildRepairLedger({ confirmed, drafts, filter: { year: 2026 } });
    expect(y2026.rows.map((r) => r.settlementId)).toEqual([2, 3]);
    expect(y2026.totals.total).toBe(60000);

    const unit1 = buildRepairLedger({ confirmed, drafts, filter: { unitId: 1 } });
    expect(unit1.totals.total).toBe(30000);
    expect(unit1.pending).toEqual([]); // 예정도 호실 필터

    expect(buildRepairLedger({ confirmed, drafts, filter: { year: 2026, unitId: 1 } }).totals.total).toBe(20000);
    expect(ledgerTotals([])).toEqual({ byUnit: [], byYear: [], total: 0 });
  });

  it('CSV: BOM · 헤더 · 행 · 합계 줄, 쉼표·따옴표 이스케이프', () => {
    const rows = [
      { date: '2026-09-26', unitName: '1234호', zone: '주방', itemName: '후드 필터', amount: 60000, reason: '자연 마모 후보', settlementId: 1 },
      { date: '2026-09-26', unitName: '1234호', zone: '베란다', itemName: '방충망, "앞"', amount: 45000, reason: '소액 일괄', settlementId: 1 },
    ];
    const csv = toCsv({ rows, totals: { total: 105000 } });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('확정일,호실,구역,항목,금액,사유,정산번호');
    expect(lines[1]).toBe('2026-09-26,1234호,주방,후드 필터,60000,자연 마모 후보,1');
    expect(lines[2]).toBe('2026-09-26,1234호,베란다,"방충망, ""앞""",45000,소액 일괄,1');
    expect(lines.at(-1)).toBe('합계,,,,105000,,');
    expect(csvCell(null)).toBe('');
  });

  it('필터 파라미터 검증', () => {
    expect(parseLedgerFilter({})).toEqual({ year: null, unitId: null });
    expect(parseLedgerFilter({ year: '2026', unitId: '1' })).toEqual({ year: 2026, unitId: 1 });
    expect(parseLedgerFilter({ year: 'abc' })).toEqual({ error: 'year' });
  });
});

describe('수선비 장부 API (창 16)', () => {
  let db, app, ids, settlementId;
  const as = (uid) => ({ 'x-user-id': String(uid) });
  const CONFIRMED_AT = '2026-09-26T03:00:00.000Z';
  const ledger = (query = '', uid = ids.owner) => request(app).get(`/api/owner/repair-ledger${query}`).set(as(uid));
  const csv = (query = '', uid = ids.owner) => request(app).get(`/api/owner/repair-ledger.csv${query}`).set(as(uid));

  async function share() {
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    return (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data.token;
  }
  const respond = (token, itemCode, response, text) =>
    request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response, text });
  const confirm = () => request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner));

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date(CONFIRMED_AT) });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
  });

  it('확정 전 정산은 예정으로만, 합계 0', async () => {
    await share();
    const d = (await ledger()).body.data;
    expect(d.rows).toEqual([]);
    expect(d.totals.total).toBe(0);
    expect(d.pending.map((r) => [r.itemName, r.amount, r.reason])).toEqual(
      expect.arrayContaining([
        ['후드 필터', 60000, '자연 마모 후보'],
        ['방충망', 45000, '소액 일괄'],
      ])
    );
  });

  it('시연: 모두 동의 → 합의 확정 → 장부 105,000 (자연 마모 후보 · 소액 일괄)', async () => {
    const token = await share();
    await respond(token, 'LIVING_WALLPAPER', 'agree');
    await respond(token, 'BATHROOM_SILICONE', 'agree');
    expect((await confirm()).status).toBe(200);

    const d = (await ledger()).body.data;
    expect(d.pending).toEqual([]);
    expect(d.totals.total).toBe(105000);
    expect(d.totals.byUnit).toEqual([{ unitId: d.rows[0].unitId, unitName: '1234호', total: 105000, count: 2 }]);
    expect(d.totals.byYear).toEqual([{ year: 2026, total: 105000, count: 2 }]);
    expect(d.rows.map((r) => [r.date, r.itemName, r.amount, r.reason, r.settlementId, r.hashOk])).toEqual(
      expect.arrayContaining([
        ['2026-09-26', '후드 필터', 60000, '자연 마모 후보', settlementId, true],
        ['2026-09-26', '방충망', 45000, '소액 일괄', settlementId, true],
      ])
    );

    // 확정 뒤 DB 항목을 바꿔도 장부는 스냅샷 기준
    db.prepare("UPDATE settlement_items SET estimate_cost = 999000 WHERE item_code = 'KITCHEN_HOOD_FILTER'").run();
    expect((await ledger()).body.data.totals.total).toBe(105000);

    // 필터
    expect((await ledger('?year=2025')).body.data.totals.total).toBe(0);
    expect((await ledger('?year=2026')).body.data.totals.total).toBe(105000);
    const unit345 = db.prepare("SELECT id FROM units WHERE name = '345호'").get().id;
    expect((await ledger(`?unitId=${unit345}`)).body.data.rows).toEqual([]);
    expect((await ledger('?year=abc')).status).toBe(400);
  });

  it('시연(이의): 벽지 이의 → 임대인 부담으로 돌리기 → 확정 → 585,000', async () => {
    const token = await share();
    await respond(token, 'LIVING_WALLPAPER', 'object', '입주 때부터 얼룩이 있었습니다');
    await request(app)
      .patch(`/api/settlements/${settlementId}/items/LIVING_WALLPAPER`)
      .set(as(ids.owner))
      .send({ payer: 'landlord' });
    await respond(token, 'BATHROOM_SILICONE', 'agree');
    expect((await confirm()).status).toBe(200);

    const d = (await ledger()).body.data;
    expect(d.totals.total).toBe(585000);
    expect(d.rows.find((r) => r.itemName === '벽지')).toMatchObject({ amount: 480000, reason: '이의 후 임대인 부담' });
  });

  it('CSV: text/csv · BOM · 헤더 · 합계 줄', async () => {
    const token = await share();
    await respond(token, 'LIVING_WALLPAPER', 'agree');
    await respond(token, 'BATHROOM_SILICONE', 'agree');
    await confirm();

    const r = await csv('?year=2026').buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(r.headers['content-disposition']).toContain('attachment; filename="repair-ledger-2026.csv"');
    const buf = r.body;
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const lines = buf.toString('utf-8').slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('확정일,호실,구역,항목,금액,사유,정산번호');
    expect(lines).toHaveLength(4);
    expect(lines).toContain(`2026-09-26,1234호,주방,후드 필터,60000,자연 마모 후보,${settlementId}`);
    expect(lines.at(-1)).toBe('합계,,,,105000,,');
  });

  it('권한: owner만 (tenant·시공업자 403, 헤더 없음 401, 남의 호실 403)', async () => {
    expect((await ledger('', ids.tenant)).status).toBe(403);
    expect((await ledger('', ids.contractor)).status).toBe(403);
    expect((await csv('', ids.tenant)).status).toBe(403);
    expect((await request(app).get('/api/owner/repair-ledger')).status).toBe(401);
    expect((await request(app).get('/api/owner/repair-ledger.csv')).status).toBe(401);
    expect((await ledger('?unitId=9999')).status).toBe(403);
  });
});
