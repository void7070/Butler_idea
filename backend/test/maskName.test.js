import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { maskName, maskReportSnapshot } from '../src/lib/maskName.js';

const SEED_NAMES = ['이시공', '김임대', '박임차', '최임차'];
const hasRealName = (body) => SEED_NAMES.filter((n) => JSON.stringify(body).includes(n));

describe('maskName (순수, 창 27)', () => {
  it('경계값: 1·2·3·4·5글자, 빈 값·null', () => {
    expect(maskName('김')).toBe('김');
    expect(maskName('김철')).toBe('김*');
    expect(maskName('박임차')).toBe('박*차');
    expect(maskName('남궁민수')).toBe('남**수');
    expect(maskName('제갈공명이')).toBe('제***이');
    expect(maskName('')).toBe('');
    expect(maskName(null)).toBeNull();
    expect(maskName(undefined)).toBeUndefined();
  });

  it('스냅샷 참여자 이름만 가린 복사본, 원본은 그대로', () => {
    const snap = { unit: { name: '1234호' }, parties: { contractor: { id: 1, name: '이시공', org: 'A' }, owner: null } };
    const masked = maskReportSnapshot(snap);
    expect(masked.parties).toEqual({ contractor: { id: 1, name: '이*공', org: 'A' }, owner: null });
    expect(masked.unit.name).toBe('1234호');
    expect(snap.parties.contractor.name).toBe('이시공');
    expect(maskReportSnapshot(null)).toBeNull();
  });
});

describe('공유 링크 이름 가리기 API (창 27)', () => {
  let db, app, ids;
  const as = (uid) => ({ 'x-user-id': String(uid) });

  beforeEach(() => {
    db = createDb(':memory:');
    applySchema(db);
    seed(db);
    app = createApp(db, { aiComplete: async () => '{}', now: () => new Date('2026-09-26T09:00:00Z') });
    const idByName = (name) => db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
    ids = { contractor: idByName('이시공'), owner: idByName('김임대'), tenant: idByName('박임차') };
  });

  const shareReport = async (reportId) =>
    (await request(app).post(`/api/reports/${reportId}/share`).set(as(ids.owner))).body.data.token;

  it('모든 시드 리포트의 공유 응답에 실명이 없고, verify는 저장된 원본 기준 그대로', async () => {
    const reports = db.prepare('SELECT id FROM reports ORDER BY id').all();
    expect(reports.length).toBeGreaterThan(0);
    for (const { id } of reports) {
      const before = db.prepare('SELECT snapshot_json, snapshot_hash FROM report_snapshots WHERE report_id = ?').get(id);
      const ownerVerify = (await request(app).get(`/api/reports/${id}/verify`).set(as(ids.owner))).body.data;

      const res = await request(app).get(`/api/share/${await shareReport(id)}`);
      expect(res.status).toBe(200);
      expect(hasRealName(res.body)).toEqual([]);
      expect(res.body.data.report.parties.contractor.name).toBe('이*공');
      expect(res.body.data.report.parties.owner.name).toBe('김*대');
      expect(res.body.data.verify).toEqual(ownerVerify);
      expect(res.body.data.verify.ok).toBe(true);

      // 저장된 스냅샷·해시는 바뀌지 않는다
      const after = db.prepare('SELECT snapshot_json, snapshot_hash FROM report_snapshots WHERE report_id = ?').get(id);
      expect(after).toEqual(before);
    }
  });

  it('변조된 스냅샷은 공유 화면에서도 여전히 변경 감지', async () => {
    const id = db.prepare('SELECT id FROM reports ORDER BY id LIMIT 1').get().id;
    db.prepare("UPDATE report_snapshots SET snapshot_json = replace(snapshot_json, '\"grade\"', '\"grade\" ') WHERE report_id = ?").run(id);
    const res = await request(app).get(`/api/share/${await shareReport(id)}`);
    expect(res.body.data.verify.ok).toBe(false);
  });

  it('정산 링크 응답(확정 전·응답 후·확정 후)에도 실명이 없다', async () => {
    const settlementId = db.prepare('SELECT id FROM settlements ORDER BY id LIMIT 1').get().id;
    await request(app).post(`/api/settlements/${settlementId}/bulk-small`).set(as(ids.owner)).send({});
    const { token } = (await request(app).post(`/api/settlements/${settlementId}/share`).set(as(ids.owner))).body.data;
    expect(hasRealName((await request(app).get(`/api/share/settlement/${token}`)).body)).toEqual([]);
    for (const itemCode of ['LIVING_WALLPAPER', 'BATHROOM_SILICONE']) {
      const r = await request(app).post(`/api/share/settlement/${token}/respond`).send({ itemCode, response: 'agree' });
      expect(hasRealName(r.body)).toEqual([]);
    }
    expect((await request(app).post(`/api/settlements/${settlementId}/confirm`).set(as(ids.owner))).status).toBe(200);
    const confirmed = await request(app).get(`/api/share/settlement/${token}`);
    expect(hasRealName(confirmed.body)).toEqual([]);
    expect(confirmed.body.data.verify.ok).toBe(true);
  });

  it('로그인 화면 API는 실명 그대로', async () => {
    const id = db.prepare('SELECT id FROM reports ORDER BY id LIMIT 1').get().id;
    for (const uid of [ids.owner, ids.contractor]) {
      const res = await request(app).get(`/api/reports/${id}`).set(as(uid));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain('이시공');
      expect(JSON.stringify(res.body)).toContain('김임대');
    }
    const tenant = await request(app).get(`/api/reports/${id}`).set(as(ids.tenant));
    expect(JSON.stringify(tenant.body)).toContain('박임차');
  });
});
