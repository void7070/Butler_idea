import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

let db;
let contractorId;
let ownerId;

beforeEach(() => {
  db = createDb(':memory:');
  applySchema(db);
  seed(db);
  contractorId = db.prepare("SELECT id FROM users WHERE role='contractor'").get().id;
  ownerId = db.prepare("SELECT id FROM users WHERE role='owner'").get().id;
});

const GOOD_JSON = JSON.stringify({
  summary: '거실 창호 상태를 추가 확인하세요.',
  actionCards: [{ title: '사진 보강', detail: '창틀을 가까이 촬영' }],
  requiredDocuments: ['창호 사진'],
  cautionPhrases: ['객관적 사실 위주로 기록'],
  opinionDraft: '거실 창호 실리콘 점검 권장.',
});

const okComplete = async () => GOOD_JSON;
const throwComplete = async () => {
  throw new Error('network down');
};
const forbiddenComplete = async () =>
  JSON.stringify({
    summary: '벽지 손상. 임차인의 법적 책임이 있습니다.',
    actionCards: [],
    requiredDocuments: [],
    cautionPhrases: ['소송 가능성 있음', '객관적으로 기록'],
    opinionDraft: '보증금 공제가 필요합니다.',
  });

const appWith = (complete) => createApp(db, { aiComplete: complete });
const asContractor = (req) => req.set('x-user-id', String(contractorId));

async function createDraft(app) {
  const res = await asContractor(request(app).post('/api/inspections')).send({
    unitId: db.prepare('SELECT id FROM units LIMIT 1').get().id,
    type: 'periodic',
    items: [{ category: '거실', name: '창호', state: 'caution' }],
  });
  return res.body.data.inspection.id;
}

describe('POST /api/ai/inspection-guide', () => {
  it('정상 응답을 가이드로 반환 (fallback=false)', async () => {
    const app = appWith(okComplete);
    const res = await asContractor(request(app).post('/api/ai/inspection-guide')).send({
      type: 'periodic',
      items: [{ category: '거실', name: '창호', state: 'caution' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.fallback).toBe(false);
    expect(res.body.data.guide.summary).toContain('창호');
    expect(res.body.data.guide.opinionDraft).toBeTruthy();
  });

  it('AI 호출 실패 시 기본 템플릿으로 폴백 (200, fallback=true)', async () => {
    const app = appWith(throwComplete);
    const res = await asContractor(request(app).post('/api/ai/inspection-guide')).send({ type: 'periodic' });
    expect(res.status).toBe(200);
    expect(res.body.data.fallback).toBe(true);
    expect(res.body.data.guide.actionCards.length).toBeGreaterThan(0);
  });

  it('금지 표현은 제거되어 반환', async () => {
    const app = appWith(forbiddenComplete);
    const res = await asContractor(request(app).post('/api/ai/inspection-guide')).send({ type: 'periodic' });
    expect(res.body.data.guide.summary).not.toContain('법적 책임');
    expect(res.body.data.guide.opinionDraft).toBe(''); // 보증금 공제 문장 제거됨
    expect(res.body.data.guide.cautionPhrases).toEqual(['객관적으로 기록']);
  });

  it('inspectionId를 주면 ai_guides에 저장된다', async () => {
    const app = appWith(okComplete);
    const id = await createDraft(app);
    await asContractor(request(app).post('/api/ai/inspection-guide')).send({ inspectionId: id });
    const n = db.prepare('SELECT COUNT(*) n FROM ai_guides WHERE inspection_id = ?').get(id).n;
    expect(n).toBe(1);
  });

  it('저장된 가이드는 제출 시 스냅샷에 포함된다', async () => {
    const app = appWith(okComplete);
    const id = await createDraft(app);
    await asContractor(request(app).post('/api/ai/inspection-guide')).send({ inspectionId: id });
    const submit = await asContractor(request(app).post(`/api/inspections/${id}/submit`));
    const snap = JSON.parse(
      db.prepare('SELECT snapshot_json FROM report_snapshots WHERE report_id = ?').get(submit.body.data.reportId)
        .snapshot_json
    );
    expect(snap.aiGuide).not.toBeNull();
    expect(snap.aiGuide.summary).toContain('창호');
  });

  it('다른 사람의 점검 inspectionId면 403', async () => {
    const app = appWith(okComplete);
    const id = await createDraft(app);
    const res = await request(app)
      .post('/api/ai/inspection-guide')
      .set('x-user-id', String(ownerId))
      .send({ inspectionId: id });
    expect(res.status).toBe(403);
  });

  it('사용자 헤더 없으면 401', async () => {
    const app = appWith(okComplete);
    const res = await request(app).post('/api/ai/inspection-guide').send({ type: 'periodic' });
    expect(res.status).toBe(401);
  });
});
