import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import EvidencePackage from '../src/views/EvidencePackage.vue';
import { setUser } from '../src/stores/session.js';
import {
  EVIDENCE_NOTICES,
  evidencePath,
  evidenceButton,
  formatStamp,
  integrityRows,
  integritySummary,
  coverView,
  zoneRow,
  itemCardView,
  responseRows,
  linkLines,
  payerLabel,
} from '../src/lib/evidenceView.js';

const HASH_A = 'aaaa111122223333444455556666777788889999000011112222333344445555';
const HASH_B = 'bbbb111122223333444455556666777788889999000011112222333344446666';

const PKG = {
  generatedAt: '2026-09-27T01:00:00.000Z',
  settlement: { id: 1, status: 'hold', frozen: false, confirmedAt: null, moveInDate: '2024-03-02', moveOutDate: '2026-03-02', elapsedMonths: 24 },
  unit: { id: 1, name: '1234호', building: '버틀러빌', address: '서울' },
  lease: {
    range: '2024-03-02 ~ 2026-03-02',
    deposit: 50000000,
    tenantName: '박임차',
    clauses: [{ clauseNo: 3, text: '도배 24개월 이내 훼손 시 전액', applyLabel: '자동 적용', tenantConfirmedAt: '2024-03-01T10:00:00.000Z' }],
  },
  baseline: {
    reportId: 4,
    date: '2024-03-02',
    zoneConfirmations: [
      { zone: '거실', author: true, tenant: true, tenantConfirmedAt: '2024-03-02 10:00:00' },
      { zone: '베란다', author: true, tenant: false, tenantConfirmedAt: null },
    ],
    approvedTenantReports: [{ id: 1, zone: '현관', name: '신발장', state: 'minor', text: '경첩 헐거움', createdAt: '2024-03-04 20:00:00', decidedAt: '2024-03-05 09:00:00' }],
    rejectedTenantReports: [],
    pendingTenantReportCount: 1,
  },
  moveOut: { reportId: 5, date: '2026-03-02', typeLabel: '퇴거 후' },
  items: [
    {
      itemCode: 'LIVING_WALLPAPER',
      zone: '거실',
      name: '벽지',
      from: 'normal',
      to: 'damaged',
      evidence: 'high',
      payer: 'tenant',
      amount: 480000,
      basis: { type: 'clause', clauseNo: 3, title: '도배', text: '도배 24개월 이내 훼손 시 전액', formula: '계약 특약 제3항 적용' },
      moveInImages: [{ id: 1, data_base64: 'data:in', caption: '입주' }],
      moveOutImages: [{ id: 2, data_base64: 'data:out', caption: '퇴거' }],
      tenantResponse: { response: 'object', text: '입주 때부터 얼룩', image: 'data:obj', respondedAt: '2026-09-26T09:00:00.000Z' },
    },
    {
      itemCode: 'BATHROOM_SILICONE',
      zone: '화장실',
      name: '실리콘',
      from: 'minor',
      to: 'damaged',
      evidence: 'mid',
      payer: 'tenant',
      amount: 90000,
      basis: { type: 'standard', formula: '표준 기준 · 견적 150,000원 × 잔존 60%' },
      moveInImages: [],
      moveOutImages: [],
      tenantResponse: { response: 'agree', text: null, image: null, respondedAt: '2026-09-26T08:00:00.000Z' },
    },
  ],
  fees: [{ clauseNo: 4, title: '퇴거 청소비', text: '청소비 20만 원', amount: 200000 }],
  manualClauses: [{ clauseNo: 6, text: '기타 파손은 협의' }],
  totals: { tenantTotal: 770000, deposit: 50000000, depositReturn: 49230000, landlordTotal: 105000, holdTotal: 0 },
  link: { createdAt: '2026-09-26T07:00:00.000Z', firstViewedAt: null, expiresAt: '2026-10-03T07:00:00.000Z' },
  integrity: {
    moveIn: { ok: true, storedHash: HASH_A, currentHash: HASH_A },
    moveOut: { ok: false, storedHash: HASH_B, currentHash: HASH_A },
    settlement: null,
    verifiedAt: '2026-09-27T01:00:00.000Z',
  },
};

describe('evidenceView 순수 로직 (창 19)', () => {
  it('경로·버튼: 보류면 강조, 정산 없으면 null', () => {
    expect(evidencePath(7)).toBe('/owner/settlements/7/evidence');
    expect(evidenceButton({ id: 1, status: 'hold' })).toMatchObject({ to: '/owner/settlements/1/evidence', emphasized: true });
    expect(evidenceButton({ id: 1, status: 'draft' }).emphasized).toBe(false);
    expect(evidenceButton({ id: 1, status: 'confirmed' }).emphasized).toBe(false);
    expect(evidenceButton(null)).toBeNull();
  });

  it('formatStamp: 날짜만은 그대로, 시간대 없는 시각은 현지 그대로, ISO는 현지로 바꾼다', () => {
    expect(formatStamp('2024-03-02')).toBe('2024-03-02');
    expect(formatStamp('2024-03-02 10:00:00')).toBe('2024-03-02 10:00');
    const d = new Date(Date.UTC(2024, 2, 2, 10, 0));
    const p = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    expect(formatStamp('2024-03-02T10:00:00.000Z')).toBe(local);
    expect(formatStamp(null)).toBe('');
  });

  it('무결성 표·요약: 일치 / 변경 감지 / 확정 전 정산서 없음', () => {
    const rows = integrityRows(PKG);
    expect(rows.map((r) => r.status)).toEqual(['ok', 'fail', 'none']);
    expect(rows[0].label).toBe('입주 기준선 리포트 #4');
    expect(rows[1].text).toContain('변경 감지');
    expect(rows[2].text).toContain('확정 전');
    expect(integritySummary(PKG)).toEqual({ ok: false, text: '해시 검증 1/2 일치 · 1건 변경 감지' });
    const allOk = { ...PKG, integrity: { ...PKG.integrity, moveOut: PKG.integrity.moveIn } };
    expect(integritySummary(allOk)).toEqual({ ok: true, text: '해시 검증 2/2 일치' });
  });

  it('표지·구역·항목 카드·응답 이력·링크', () => {
    const cover = coverView(PKG);
    expect(cover.unitName).toBe('버틀러빌 1234호');
    expect(cover.period).toBe('입주 2024-03-02 → 퇴거 2026-03-02 (경과 24개월)');
    expect(cover.statusText).toContain('보류');
    expect(cover.hashes).toEqual(['입주 기준선 리포트 #4 aaaa…5555', '퇴거 리포트 #5 bbbb…6666']);
    expect(cover.hashParts.map((h) => [h.label, h.hash])).toEqual([['입주 기준선 리포트 #4', 'aaaa…5555'], ['퇴거 리포트 #5', 'bbbb…6666']]);

    expect(zoneRow(PKG.baseline.zoneConfirmations[1])).toMatchObject({ author: '확인', tenant: '미확인', tenantAt: '' });

    const wall = itemCardView(PKG.items[0]);
    expect(wall).toMatchObject({
      title: '거실 · 벽지',
      stateText: '입주 정상 → 퇴거 손상',
      payerLabel: '임차인 부담',
      amountText: '480,000원',
      basisTitle: '계약 특약 제3항 (도배)',
      clauseText: '도배 24개월 이내 훼손 시 전액',
    });
    expect(itemCardView(PKG.items[1])).toMatchObject({ basisTitle: '표준 기준 (잔존가치 계산)', clauseText: '' });
    // 임대인이 조건 해당을 확인한 조건부 특약 (창 25)
    const pet = itemCardView({ ...PKG.items[0], basis: { type: 'clause', kind: 'standard', clauseNo: 5, title: '반려동물 손상', text: '반려동물로 인한 …' } });
    expect(pet).toMatchObject({ basisTitle: '계약 특약 제5항 (반려동물 손상) · 표준 기준 금액', clauseText: '반려동물로 인한 …' });
    expect(itemCardView({ ...PKG.items[1], from: 'unknown' }).stateText).toContain('기록 없음');

    const res = responseRows(PKG.items);
    expect(res.map((r) => r.key)).toEqual(['BATHROOM_SILICONE', 'LIVING_WALLPAPER']); // 응답 시각 순
    expect(res[1]).toMatchObject({ label: '이의', text: '입주 때부터 얼룩', image: 'data:obj' });

    expect(linkLines(null)).toEqual(['임차인 확인 링크를 만들지 않았습니다.']);
    expect(linkLines(PKG.link)[1]).toBe('임차인 열람 기록 없음');
    expect(payerLabel('hold')).toBe('보류');
  });

  it('고지 문구는 법률 자문이 아니며 판단은 조정기관·법원이 한다', () => {
    const text = EVIDENCE_NOTICES.join(' ');
    expect(text).toContain('법률 자문이 아닙니다');
    expect(text).toContain('조정기관·법원');
  });
});

describe('EvidencePackage 화면', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('표지 → 1~5장 → 고지, 인쇄 버튼은 window.print', async () => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        calls.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { evidence: PKG } }) });
      })
    );
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const stub = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/owner/settlements/:id/evidence', component: EvidencePackage },
        { path: '/owner/settlement', name: 'owner-settlement', component: stub },
      ],
    });
    router.push('/owner/settlements/1/evidence');
    await router.isReady();
    const w = mount(EvidencePackage, { global: { plugins: [router] } });
    await flushPromises();

    expect(calls[0]).toMatch(/\/api\/settlements\/1\/evidence$/);
    expect(w.find('[data-test="evidence-cover"]').text()).toContain('1234호');
    expect(w.find('[data-test="cover-integrity"]').text()).toContain('1건 변경 감지');
    expect(w.find('[data-test="evidence-lease"]').text()).toContain('도배 24개월 이내 훼손 시 전액');
    expect(w.find('[data-test="evidence-baseline"]').text()).toContain('신발장');
    expect(w.findAll('[data-test="evidence-item"]')).toHaveLength(2);
    expect(w.find('[data-test="evidence-items"]').text()).toContain('기타 파손은 협의');
    expect(w.find('[data-test="evidence-totals"]').text()).toContain('49,230,000원');
    const responses = w.findAll('[data-test="evidence-response"]');
    expect(responses).toHaveLength(2);
    expect(responses[1].text()).toContain('입주 때부터 얼룩');
    expect(responses[1].find('img').attributes('src')).toBe('data:obj');
    expect(w.findAll('[data-test="evidence-integrity"] [data-status]').map((e) => e.attributes('data-status'))).toEqual(['ok', 'fail', 'none']);
    expect(w.find('[data-test="evidence-notice"]').text()).toContain('조정기관·법원');
    expect(w.find('a[href^="/owner/settlement?"]').exists()).toBe(true);

    await w.find('[data-test="print-evidence"]').trigger('click');
    expect(print).toHaveBeenCalled();
  });
});
