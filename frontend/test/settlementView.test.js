import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SettlementView from '../src/views/SettlementView.vue';
import { setUser } from '../src/stores/session.js';
import {
  PAYER_OPTIONS,
  DISCLAIMERS,
  formatWon,
  bulkSmallLabel,
  settlementRequest,
  clauseSummary,
  residualPercent,
  itemAmountView,
  feeRow,
  manualNotice,
  totalsView,
  parseCostInput,
  bulkSmallResult,
  conditionClauseViews,
  conditionPatch,
} from '../src/lib/settlementView.js';

// 시연 기준 데이터 (백엔드 settlement 응답 형태, 소액 일괄 처리 후)
const wallpaper = {
  itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high',
  estimateCost: 480000, payer: 'tenant', tenantAmount: 480000, landlordAmount: 0, holdAmount: 0,
  basis: { type: 'clause', clauseNo: 3, stdAmount: 320000, residual: 0.6667 },
};
const silicone = {
  itemCode: 'BATH_SILICONE', zone: '화장실', name: '실리콘', tier: 'core', from: 'minor', to: 'damaged', evidence: 'mid',
  estimateCost: 150000, payer: 'tenant', tenantAmount: 90000, landlordAmount: 0, holdAmount: 0,
  basis: { type: 'standard', clauseNo: null, stdAmount: 90000, residual: 0.6 },
};
const hood = {
  itemCode: 'KITCHEN_HOOD', zone: '주방', name: '후드 필터', tier: 'general', from: 'normal', to: 'minor', evidence: 'high',
  estimateCost: 60000, payer: 'landlord', tenantAmount: 0, landlordAmount: 60000, holdAmount: 0, basis: null,
};
const screen = {
  itemCode: 'VERANDA_SCREEN', zone: '베란다', name: '방충망', tier: 'general', from: 'unknown', to: 'damaged', evidence: 'low',
  estimateCost: 45000, payer: 'hold', tenantAmount: 0, landlordAmount: 0, holdAmount: 45000, basis: null,
};
const lease = {
  id: 1,
  clauses: [
    { clauseNo: 3, templateTitle: '도배·장판 기간 내 훼손 전액 부담', text: '입주 후 24개월 이내 벽지·바닥재 훼손 시 …' },
    { clauseNo: 4, templateTitle: '퇴거 청소비', text: '퇴거 시 청소비 200,000원은 임차인이 부담한다.' },
    { clauseNo: 6, templateTitle: null, text: '기타 파손은 임대인과 임차인이 협의하여 정한다.' },
  ],
};
const cleaningFee = { clauseNo: 4, templateCode: 'CLEANING_FEE', title: '퇴거 청소비', text: lease.clauses[1].text, payer: 'tenant', amount: 200000 };

describe('settlementView 순수 로직', () => {
  it('부담자 버튼 3개', () => {
    expect(PAYER_OPTIONS.map((o) => o.label)).toEqual(['임차인 부담', '임대인 부담', '보류']);
  });

  it('금액 형식', () => {
    expect(formatWon(480000)).toBe('480,000원');
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(null)).toBe('-');
    expect(bulkSmallLabel(50000)).toBe('5만 원 이하 항목은 임대인 부담으로 처리');
    expect(residualPercent(0.6)).toBe('60%');
  });

  it('query → 생성 요청 본문', () => {
    expect(settlementRequest({ moveInReportId: '3', moveOutReportId: '7' })).toEqual({ moveInReportId: 3, moveOutReportId: 7 });
    expect(settlementRequest({ moveInReportId: '3' })).toBeNull();
    expect(settlementRequest({ moveInReportId: 'x', moveOutReportId: '7' })).toBeNull();
    expect(settlementRequest(undefined)).toBeNull();
  });

  it('특약 요약: 템플릿 제목, 없으면 문장(길면 자름), 없는 번호는 빈 문자열', () => {
    expect(clauseSummary(lease, 3)).toBe('도배·장판 기간 내 훼손 전액 부담');
    expect(clauseSummary(lease, 6, 10)).toBe('기타 파손은 임대인…');
    expect(clauseSummary(lease, 9)).toBe('');
    expect(clauseSummary(null, 3)).toBe('');
  });

  it('임차인 부담 · 특약: 금액 + 특약 제n항 (요약) + 표준 참고 금액', () => {
    const v = itemAmountView(wallpaper, lease);
    expect(v.amountText).toBe('480,000원');
    expect(v.basisText).toBe('적용 기준: 계약 특약 제3항 (도배·장판 기간 내 훼손 전액 부담)');
    expect(v.referenceText).toBe('참고: 표준 기준 320,000원');
    // 계약을 못 불러오면 요약 없이
    expect(itemAmountView(wallpaper, null).basisText).toBe('적용 기준: 계약 특약 제3항');
  });

  it('임차인 부담 · 표준: 잔존 n%, 참고 금액 없음', () => {
    const v = itemAmountView(silicone, lease);
    expect(v.amountText).toBe('90,000원');
    expect(v.basisText).toBe('적용 기준: 표준 기준 · 잔존 60%');
    expect(v.referenceText).toBe('');
  });

  it('임대인 부담 → 수선비 장부, 보류 → 견적만', () => {
    expect(itemAmountView(hood).amountText).toBe('임대인 부담 → 수선비 장부 60,000원');
    expect(itemAmountView(hood).basisText).toBe('');
    expect(itemAmountView(screen).amountText).toBe('보류 · 견적 45,000원');
    expect(itemAmountView({ ...screen, estimateCost: null, holdAmount: 0 }).amountText).toBe('보류 · 견적 미입력');
  });

  it('견적이 없으면 안내 문구', () => {
    const v = itemAmountView({ ...silicone, estimateCost: null, tenantAmount: 0, basis: { ...silicone.basis, stdAmount: 0 } });
    expect(v.amountText).toBe('0원');
    expect(v.noteText).toBe('견적 금액을 입력하면 계산됩니다.');
    expect(itemAmountView({ ...hood, estimateCost: null, landlordAmount: 0 }).amountText).toBe('임대인 부담 → 수선비 장부 -');
  });

  it('고정 금액 특약 줄, 수동 확인 안내', () => {
    expect(feeRow(cleaningFee)).toMatchObject({ title: '퇴거 청소비', basisText: '적용 기준: 계약 특약 제4항', amountText: '200,000원' });
    expect(manualNotice({ clauseNo: 6, text: '기타 파손은 협의' })).toMatchObject({ title: '수동 확인 필요 · 특약 제6항', text: '기타 파손은 협의' });
  });

  it('합계: 시연 기준 770,000 / 49,230,000 / 105,000', () => {
    const t = totalsView({ tenantTotal: 770000, landlordTotal: 105000, holdTotal: 0, deposit: 50000000, depositReturn: 49230000 });
    expect(t.rows.map((r) => [r.label, r.value])).toEqual([
      ['임차인 청구 합계', '770,000원'],
      ['보증금 반환 예정', '49,230,000원'],
      ['임대인 부담 → 수선비 장부', '105,000원'],
    ]);
    expect(t.holdText).toBe('');
  });

  it('합계: 보류 금액 안내, 계약 없음', () => {
    const t = totalsView({ tenantTotal: 0, landlordTotal: 0, holdTotal: 45000, deposit: null, depositReturn: null });
    expect(t.rows[1].value).toBe('계약 정보 없음');
    expect(t.holdText).toBe('보류 45,000원은 합계에 넣지 않았습니다.');
  });

  it('견적 입력 파싱', () => {
    expect(parseCostInput('150,000')).toEqual({ ok: true, value: 150000 });
    expect(parseCostInput(' 45000원 ')).toEqual({ ok: true, value: 45000 });
    expect(parseCostInput('')).toEqual({ ok: true, value: null });
    expect(parseCostInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseCostInput('-100').ok).toBe(false);
    expect(parseCostInput('1.5').ok).toBe(false);
    expect(parseCostInput('abc').ok).toBe(false);
  });

  it('소액 일괄 결과 안내', () => {
    expect(bulkSmallResult(['VERANDA_SCREEN'], [screen])).toBe('베란다 방충망 → 임대인 부담으로 바꿨습니다.');
    expect(bulkSmallResult([], [screen])).toBe('바뀐 항목이 없습니다.');
  });
});

// 창 25: 반려동물 특약 (조건부) — 1234호 + demo:pet 이면 벽지에 제3항(full_cost)이 먼저 적용된다
const PET = { clauseNo: 5, title: '반려동물 손상', text: '반려동물로 인한 문·문틀, 바닥재, 벽지 손상은 표준 기준에 따라 임차인이 부담한다.', condition: 'pet_damage' };
const petWallpaper = { ...wallpaper, conditionalClauses: [PET], conditionClauseNo: null, fullCostClauseNo: 3 };
// 제3항이 없는 계약에서 임대인이 체크한 경우
const petFloor = {
  itemCode: 'ROOM1_FLOOR', zone: '방1', name: '바닥재', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high',
  estimateCost: 400000, payer: 'tenant', tenantAmount: 300000, landlordAmount: 0, holdAmount: 0,
  basis: { type: 'clause', clauseNo: 5, kind: 'standard', stdAmount: 300000, residual: 0.75, clause: { clauseNo: 5, title: '반려동물 손상', text: PET.text } },
  conditionalClauses: [PET], conditionClauseNo: 5, fullCostClauseNo: null,
};

describe('조건부 특약 표시 (창 25)', () => {
  it('조건부 특약이 없으면 안내 없음', () => {
    expect(conditionClauseViews(silicone)).toEqual([]);
    expect(conditionClauseViews({ ...silicone, conditionalClauses: [] })).toEqual([]);
  });

  it('체크 전: "해당 가능 · 원인 확인 필요" + 체크 상자', () => {
    const [v] = conditionClauseViews({ ...petFloor, conditionClauseNo: null });
    expect(v).toMatchObject({
      clauseNo: 5,
      noticeText: '반려동물 특약 제5항 해당 가능 · 원인 확인 필요',
      checkboxLabel: '이 손상은 특약 조건(반려동물)에 해당함',
      checked: false,
      blocked: false,
    });
  });

  it('full_cost 특약이 먼저 적용되는 항목: 안내만, 체크 상자는 비활성', () => {
    const [v] = conditionClauseViews(petWallpaper);
    expect(v).toMatchObject({ noticeText: '반려동물 특약 제5항도 해당 가능 · 제3항이 먼저 적용됨', blocked: true, checked: false });
    // 금액·근거는 제3항 그대로
    expect(itemAmountView(petWallpaper, lease).basisText).toBe('적용 기준: 계약 특약 제3항 (도배·장판 기간 내 훼손 전액 부담)');
  });

  it('체크 후: 적용 기준 = 계약 특약 제5항 (반려동물 손상) · 표준 기준 금액', () => {
    expect(conditionClauseViews(petFloor)[0].checked).toBe(true);
    const v = itemAmountView(petFloor, lease);
    expect(v.amountText).toBe('300,000원');
    expect(v.basisText).toBe('적용 기준: 계약 특약 제5항 (반려동물 손상) · 표준 기준 금액');
    expect(v.referenceText).toBe('표준 기준 · 잔존 75%');
  });

  it('체크 상자 → PATCH 본문', () => {
    expect(conditionPatch(5, true)).toEqual({ conditionClauseNo: 5 });
    expect(conditionPatch(5, false)).toEqual({ conditionClauseNo: null });
  });
});

// ── 화면: fetch를 가짜로 바꿔 생성 → 표시 → 부담자 변경 PATCH 흐름만 확인 ──
function demoSettlement(overrides = {}) {
  return {
    id: 1, unitId: 1, leaseId: 1, moveInReportId: 3, moveOutReportId: 7, status: 'draft',
    moveInDate: '2024-03-02', moveOutDate: '2026-03-02', elapsedMonths: 24,
    items: [wallpaper, silicone, hood, screen],
    fees: [cleaningFee],
    manualClauses: [{ clauseNo: 6, text: lease.clauses[2].text }],
    displayClauses: [],
    totals: { tenantTotal: 770000, landlordTotal: 60000, holdTotal: 45000, deposit: 50000000, depositReturn: 49230000 },
    ...overrides,
  };
}

const ok = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) });

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/owner/settlement', name: 'owner-settlement', component: SettlementView },
      { path: '/owner/compare', component: { template: '<div />' } },
    ],
  });
  router.push({ name: 'owner-settlement', query: { moveInReportId: '3', moveOutReportId: '7' } });
  await router.isReady();
  const wrapper = mount(SettlementView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('SettlementView 화면', () => {
  let fetchMock;
  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/settlements') && opts.method === 'POST') return ok({ settlement: demoSettlement() });
      // 계약 이력 중 정산의 leaseId 계약을 쓴다 (새 계약 id 2는 무시)
      if (url.endsWith('/api/units/1/leases')) return ok({ leases: [{ id: 2, clauses: [{ clauseNo: 3, templateTitle: '새 계약 특약', text: '…' }] }, lease] });
      if (url.includes('/items/VERANDA_SCREEN') && opts.method === 'PATCH') {
        const moved = { ...screen, payer: 'landlord', landlordAmount: 45000, holdAmount: 0 };
        return ok({
          settlement: demoSettlement({
            items: [wallpaper, silicone, hood, moved],
            totals: { tenantTotal: 770000, landlordTotal: 105000, holdTotal: 0, deposit: 50000000, depositReturn: 49230000 },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('query로 정산을 만들고 항목·특약·합계·고지 문구를 보여 준다', async () => {
    const wrapper = await mountView();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/settlements$/);
    expect(JSON.parse(opts.body)).toEqual({ moveInReportId: 3, moveOutReportId: 7 });

    expect(wrapper.findAll('[data-test="settlement-item"]')).toHaveLength(4);
    const text = wrapper.text();
    expect(text).toContain('적용 기준: 계약 특약 제3항 (도배·장판 기간 내 훼손 전액 부담)');
    expect(text).toContain('참고: 표준 기준 320,000원');
    expect(text).toContain('적용 기준: 표준 기준 · 잔존 60%');
    expect(text).toContain('임대인 부담 → 수선비 장부 60,000원');
    expect(wrapper.find('[data-test="fee-row"]').text()).toContain('200,000원');
    expect(wrapper.find('[data-test="manual-clause"]').text()).toContain('수동 확인 필요 · 특약 제6항');
    expect(wrapper.find('[data-test="totals"]').text()).toContain('49,230,000원');
    for (const d of DISCLAIMERS) expect(wrapper.find('[data-test="disclaimers"]').text()).toContain(d);
  });

  it('부담자 버튼 → PATCH 후 다시 계산된 합계로 바뀐다', async () => {
    const wrapper = await mountView();
    const screenCard = wrapper.findAll('[data-test="settlement-item"]')[3];
    await screenCard.find('[data-test="payer-landlord"]').trigger('click');
    await flushPromises();

    const patch = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(patch[0]).toMatch(/\/api\/settlements\/1\/items\/VERANDA_SCREEN$/);
    expect(JSON.parse(patch[1].body)).toEqual({ payer: 'landlord' });
    expect(wrapper.find('[data-test="totals"]').text()).toContain('105,000원');
    expect(wrapper.findAll('[data-test="settlement-item"]')[3].text()).toContain('임대인 부담 → 수선비 장부 45,000원');
  });

  it('조건부 특약: 제3항이 먼저인 벽지는 비활성 안내, 다른 항목은 체크 → PATCH { conditionClauseNo }', async () => {
    const floor = { ...petFloor, conditionClauseNo: null, basis: { type: 'standard', clauseNo: null, stdAmount: 300000, residual: 0.75 } };
    fetchMock.mockImplementation((url, opts = {}) => {
      if (url.endsWith('/api/settlements') && opts.method === 'POST') return ok({ settlement: demoSettlement({ items: [petWallpaper, floor] }) });
      if (url.endsWith('/api/units/1/leases')) return ok({ leases: [lease] });
      if (url.includes('/items/ROOM1_FLOOR') && opts.method === 'PATCH') return ok({ settlement: demoSettlement({ items: [petWallpaper, petFloor] }) });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const wrapper = await mountView();
    const [wallCard, floorCard] = wrapper.findAll('[data-test="settlement-item"]');
    expect(wallCard.find('[data-test="condition-notice"]').text()).toBe('반려동물 특약 제5항도 해당 가능 · 제3항이 먼저 적용됨');
    expect(wallCard.find('[data-test="condition-check"]').element.disabled).toBe(true);
    expect(floorCard.find('[data-test="condition-notice"]').text()).toBe('반려동물 특약 제5항 해당 가능 · 원인 확인 필요');

    await floorCard.find('[data-test="condition-check"]').setValue(true);
    await flushPromises();
    const patch = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(patch[0]).toMatch(/\/items\/ROOM1_FLOOR$/);
    expect(JSON.parse(patch[1].body)).toEqual({ conditionClauseNo: 5 });
    const after = wrapper.findAll('[data-test="settlement-item"]')[1];
    expect(after.text()).toContain('적용 기준: 계약 특약 제5항 (반려동물 손상) · 표준 기준 금액');
    expect(after.find('[data-test="condition-check"]').element.checked).toBe(true);
  });
});
