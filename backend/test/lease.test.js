import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import {
  CLAUSE_TEMPLATES,
  APPLY_MODES,
  getClauseTemplate,
  buildClause,
  clauseApplyMode,
} from '../src/domain/clauseTemplates.js';
import { ITEM_CATALOG } from '../src/domain/itemCatalog.js';

describe('clauseTemplates', () => {
  it('템플릿 5개, 코드 중복 없음, applyMode는 auto/display', () => {
    expect(CLAUSE_TEMPLATES.map((t) => t.code)).toEqual([
      'WALLPAPER_FLOOR_FULL',
      'CLEANING_FEE',
      'PET_DAMAGE',
      'NAIL_HOLES_ALLOW',
      'AIRCON_CLEANING',
    ]);
    for (const t of CLAUSE_TEMPLATES) {
      expect(APPLY_MODES).toContain(t.applyMode);
      expect(t.applyMode).not.toBe('manual');
      expect(t.defaultText).toBeTruthy();
      expect(['full_cost', 'fixed_fee', 'standard', 'display']).toContain(t.rule.kind);
      expect(['tenant', 'none']).toContain(t.rule.payer);
    }
  });

  it('대상 항목 이름은 모두 카탈로그에 있다', () => {
    const names = new Set(ITEM_CATALOG.map((it) => it.name));
    for (const t of CLAUSE_TEMPLATES) {
      for (const n of t.rule.targetItemNames ?? []) expect(names.has(n)).toBe(true);
    }
  });

  it('WALLPAPER_FLOOR_FULL: 벽지·바닥재 / 24개월 이하 / 임차인 전액', () => {
    expect(getClauseTemplate('WALLPAPER_FLOOR_FULL')).toMatchObject({
      applyMode: 'auto',
      rule: {
        kind: 'full_cost',
        payer: 'tenant',
        targetItemNames: ['벽지', '바닥재'],
        elapsed: { from: 'lease_start', to: 'move_out', maxMonths: 24, inclusive: true },
      },
    });
  });

  it('CLEANING_FEE: 기본 200,000, 파라미터로 바꿀 수 있다', () => {
    expect(getClauseTemplate('CLEANING_FEE').rule).toEqual({ kind: 'fixed_fee', payer: 'tenant', amount: 200000 });
    const c = buildClause('CLEANING_FEE', { amount: 150000 });
    expect(c.rule.amount).toBe(150000);
    expect(c.text).toContain('150,000원');
  });

  it('PET_DAMAGE: 문·문틀·바닥재·벽지 / 표준 기준 / 임차인', () => {
    expect(getClauseTemplate('PET_DAMAGE').rule).toEqual({
      kind: 'standard',
      payer: 'tenant',
      targetItemNames: ['문·문틀', '바닥재', '벽지'],
      condition: 'pet_damage',
    });
  });

  it('NAIL_HOLES_ALLOW·AIRCON_CLEANING은 표시용', () => {
    expect(getClauseTemplate('NAIL_HOLES_ALLOW')).toMatchObject({ applyMode: 'display', rule: { kind: 'display', payer: 'none' } });
    expect(buildClause('NAIL_HOLES_ALLOW', { maxCount: 3 }).rule.maxNailHoles).toBe(3);
    expect(getClauseTemplate('AIRCON_CLEANING')).toMatchObject({ applyMode: 'display', rule: { kind: 'display', payer: 'tenant' } });
  });

  it('템플릿 없는 특약은 manual, 알 수 없는 코드는 buildClause에서 throw', () => {
    expect(clauseApplyMode(null)).toBe('manual');
    expect(clauseApplyMode('NOPE')).toBe('manual');
    expect(getClauseTemplate('NOPE')).toBeNull();
    expect(() => buildClause('NOPE')).toThrow();
  });
});

describe('계약 시드 + GET /api/units/:id/lease', () => {
  let app, db, ids, u1234, u345;
  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}' });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
    const unitId = (name) => db.prepare('SELECT id FROM units WHERE name = ?').get(name).id;
    u1234 = unitId('1234호');
    u345 = unitId('345호');
  });

  it('시드: 1234호 계약 1건, 특약 3개(rule_json은 템플릿만)', () => {
    const leases = db.prepare('SELECT * FROM leases WHERE unit_id = ?').all(u1234);
    expect(leases).toHaveLength(1);
    expect(leases[0]).toMatchObject({
      unit_id: u1234,
      owner_user_id: ids.owner,
      tenant_user_id: ids.tenant,
      deposit: 50000000,
      monthly_rent: 1200000,
      start_date: '2024-03-02',
      end_date: '2026-03-02',
    });
    const clauses = db.prepare('SELECT * FROM lease_clauses WHERE lease_id = ? ORDER BY clause_no').all(leases[0].id);
    expect(clauses.map((c) => [c.clause_no, c.template_code])).toEqual([
      [3, 'WALLPAPER_FLOOR_FULL'],
      [4, 'CLEANING_FEE'],
      [6, null],
    ]);
    expect(JSON.parse(clauses[1].rule_json).amount).toBe(200000);
    expect(clauses[2].rule_json).toBeNull();
    expect(clauses[2].text).toBe('그 밖의 파손은 임대인과 임차인이 협의하여 정한다.');
    expect(clauses.every((c) => c.tenant_confirmed_at === '2024-02-20')).toBe(true);
  });

  it('owner·tenant는 계약 + 특약을 받는다 (응답 형식)', async () => {
    for (const uid of [ids.owner, ids.tenant]) {
      const res = await request(app).get(`/api/units/${u1234}/lease`).set('x-user-id', String(uid));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { lease } = res.body.data;
      expect(lease).toMatchObject({
        unitId: u1234,
        ownerUserId: ids.owner,
        tenantUserId: ids.tenant,
        deposit: 50000000,
        monthlyRent: 1200000,
        startDate: '2024-03-02',
        endDate: '2026-03-02',
      });
      expect(lease.clauses).toHaveLength(3);
      const [c3, c4, c6] = lease.clauses;
      expect(c3).toMatchObject({
        clauseNo: 3,
        templateCode: 'WALLPAPER_FLOOR_FULL',
        templateTitle: '도배·장판 기간 내 훼손 전액 부담',
        applyMode: 'auto',
        tenantConfirmedAt: '2024-02-20',
        rule: { kind: 'full_cost', targetItemNames: ['벽지', '바닥재'] },
      });
      expect(c3.text).toContain('24개월');
      expect(c4).toMatchObject({ clauseNo: 4, applyMode: 'auto', rule: { kind: 'fixed_fee', amount: 200000 } });
      expect(c6).toEqual({
        id: expect.any(Number),
        clauseNo: 6,
        text: '그 밖의 파손은 임대인과 임차인이 협의하여 정한다.',
        templateCode: null,
        templateTitle: null,
        applyMode: 'manual',
        rule: null,
        tenantConfirmedAt: '2024-02-20',
      });
    }
  });

  it('시공업자는 403', async () => {
    const res = await request(app).get(`/api/units/${u1234}/lease`).set('x-user-id', String(ids.contractor));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('연결되지 않은 호실의 tenant는 403, 헤더 없으면 401', async () => {
    const res = await request(app).get(`/api/units/${u345}/lease`).set('x-user-id', String(ids.tenant));
    expect(res.status).toBe(403);
    const noUser = await request(app).get(`/api/units/${u1234}/lease`);
    expect(noUser.status).toBe(401);
  });

  it('권한은 있지만 계약이 없는 호실은 404', async () => {
    // 345호 시드 계약(창 13)을 지워 계약 없는 호실을 만든다
    db.prepare('DELETE FROM lease_clauses').run();
    db.prepare('DELETE FROM leases WHERE unit_id = ?').run(u345);
    const res = await request(app).get(`/api/units/${u345}/lease`).set('x-user-id', String(ids.owner));
    expect(res.status).toBe(404);
  });
});
