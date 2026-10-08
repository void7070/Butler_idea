import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SharedSettlement from '../src/views/SharedSettlement.vue';
import SettlementView from '../src/views/SettlementView.vue';
import { setUser } from '../src/stores/session.js';
import {
  responseBadge,
  confirmState,
  statusBanner,
  shareLinkStatus,
  shareBasisView,
  responseFormError,
  responsePayload,
  responseProgress,
} from '../src/lib/settlementShareView.js';

const tenantItem = (code, extra = {}) => ({ itemCode: code, payer: 'tenant', tenantResponse: null, ...extra });

describe('settlementShareView (순수)', () => {
  it('확정 버튼: 이의 → 보류 → 무응답 순으로 막고, 모두 동의면 켠다', () => {
    expect(confirmState({ status: 'hold', items: [tenantItem('A', { tenantResponse: 'object' })] })).toMatchObject({ enabled: false });
    expect(confirmState({ status: 'draft', items: [{ itemCode: 'B', payer: 'hold' }] }).reason).toContain('보류');
    expect(confirmState({ status: 'draft', items: [tenantItem('A')] }).reason).toContain('1개');
    expect(
      confirmState({
        status: 'draft',
        items: [tenantItem('A', { tenantResponse: 'agree' }), { itemCode: 'B', payer: 'landlord', tenantResponse: 'object' }],
      }).enabled
    ).toBe(true);
    expect(confirmState({ status: 'confirmed', items: [] }).enabled).toBe(false);
  });

  it('상태 배너: hold면 이의 건수, draft면 없음', () => {
    const s = { status: 'hold', items: [tenantItem('A', { tenantResponse: 'object' }), tenantItem('B', { tenantResponse: 'agree' })] };
    expect(statusBanner(s).title).toBe('정산 보류 · 임차인 이의 1건');
    expect(statusBanner({ status: 'draft', items: [] })).toBeNull();
    expect(responseBadge('object').label).toBe('임차인 이의');
    expect(responseBadge(null).label).toBe('응답 대기');
  });

  it('링크 상태 문구', () => {
    expect(shareLinkStatus({ expired: true }).expiryText).toContain('만료');
    expect(shareLinkStatus({ expired: false, expiresAt: '2026-10-03T00:00:00Z', firstViewedAt: null }).viewText).toContain('아직');
  });

  it('적용 기준: 특약이면 원문, 표준이면 잔존 비율', () => {
    const clause = shareBasisView({
      basis: { type: 'clause', clauseNo: 3, stdAmount: 320000, clause: { title: '도배', text: '도배 24개월 이내 훼손 시 전액' } },
    });
    expect(clause).toEqual({
      basisText: '적용 기준: 계약 특약 제3항 (도배)',
      clauseText: '도배 24개월 이내 훼손 시 전액',
      referenceText: '참고: 표준 기준 320,000원',
    });
    const pet = shareBasisView({
      estimateCost: 400000,
      basis: { type: 'clause', clauseNo: 5, kind: 'standard', residual: 0.75, clause: { title: '반려동물 손상', text: '반려동물로 인한 …' } },
    });
    expect(pet).toEqual({
      basisText: '적용 기준: 계약 특약 제5항 (반려동물 손상) · 표준 기준 금액',
      clauseText: '반려동물로 인한 …',
      referenceText: '견적 400,000원 × 잔존 75%',
    });
    const std = shareBasisView({ estimateCost: 150000, lifespanYears: 5, basis: { type: 'standard', residual: 0.6 } });
    expect(std.basisText).toBe('적용 기준: 표준 기준 · 내구연수 5년 · 잔존 60%');
    expect(std.referenceText).toBe('견적 150,000원 × 잔존 60%');
  });

  it('응답 입력: 이의는 내용 필수, 동의는 사진을 보내지 않는다', () => {
    expect(responseFormError({ response: '' })).toContain('선택');
    expect(responseFormError({ response: 'object', text: ' ' })).toContain('이의 내용');
    expect(responseFormError({ response: 'agree' })).toBe('');
    expect(responsePayload('A', { response: 'agree', text: '', image: 'data:x' })).toEqual({ itemCode: 'A', response: 'agree' });
    expect(responsePayload('A', { response: 'object', text: ' 얼룩 ', image: 'data:x' })).toEqual({
      itemCode: 'A',
      response: 'object',
      text: '얼룩',
      image: 'data:x',
    });
    expect(responseProgress([{ response: { response: 'agree' } }, { response: null }])).toEqual({
      total: 2,
      agreed: 1,
      objected: 0,
      waiting: 1,
    });
  });
});

// ── 임차인 링크 화면: 가짜 fetch로 조회 → 이의 응답 → 기록 표시(입력 폼 사라짐) ──
const wallpaper = {
  itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high',
  lifespanYears: 6, estimateCost: 480000, tenantAmount: 480000,
  basis: { type: 'clause', clauseNo: 3, stdAmount: 320000, residual: 0.6667, clause: { clauseNo: 3, title: '도배', text: '도배 24개월 이내 훼손 시 전액 부담' } },
  response: null,
};
function shareSettlement(overrides = {}) {
  return {
    id: 1, unitName: '1234호', status: 'draft', confirmedAt: null,
    moveInDate: '2024-03-02', moveOutDate: '2026-03-02', elapsedMonths: 24,
    items: [wallpaper],
    fees: [{ clauseNo: 4, title: '퇴거 청소비', text: '퇴거 시 청소비 200,000원', amount: 200000 }],
    totals: { tenantTotal: 680000, deposit: 50000000, depositReturn: 49320000 },
    ...overrides,
  };
}
const ok = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) });

describe('SharedSettlement 화면', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/share/settlement/tok') && !opts.method) {
        return ok({ settlement: shareSettlement(), link: { expiresAt: '2026-10-03T00:00:00Z', firstViewedAt: '2026-09-26T00:00:00Z' } });
      }
      if (url.endsWith('/api/share/settlement/tok/respond') && opts.method === 'POST') {
        const response = { response: 'object', text: '입주 때부터 얼룩', image: null, respondedAt: '2026-09-26T01:00:00Z' };
        return ok({ settlement: shareSettlement({ status: 'hold', items: [{ ...wallpaper, response }] }) });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('특약 원문을 보여 주고, 이의를 남기면 보류 안내와 수정 불가 기록으로 바뀐다', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/share/settlement/:token', component: SharedSettlement }],
    });
    router.push('/share/settlement/tok');
    await router.isReady();
    const wrapper = mount(SharedSettlement, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-test="clause-text"]').text()).toContain('도배 24개월 이내 훼손 시 전액 부담');
    expect(wrapper.find('[data-test="response-guide"]').text()).toContain('수정·삭제 기능이 없습니다');

    // 이의 선택 후 내용 없이 제출 → 막힘
    await wrapper.find('[data-test="choose-object"]').trigger('click');
    await wrapper.find('[data-test="submit-response"]').trigger('click');
    expect(wrapper.text()).toContain('이의 내용을 입력하세요.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-test="object-text"]').setValue('입주 때부터 얼룩');
    await wrapper.find('[data-test="submit-response"]').trigger('click');
    await flushPromises();

    const [, opts] = fetchMock.mock.calls[1];
    expect(JSON.parse(opts.body)).toEqual({ itemCode: 'LIVING_WALLPAPER', response: 'object', text: '입주 때부터 얼룩' });
    expect(wrapper.find('[data-test="hold-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="response-record"]').text()).toContain('수정 불가');
    expect(wrapper.find('[data-test="response-form"]').exists()).toBe(false);
  });
});

// ── 임차인 링크 화면: 확정 정산서 뱃지 (창 15) ──
describe('SharedSettlement 확정 정산서 뱃지 (창 15)', () => {
  const hash = 'ab12' + '0'.repeat(56) + 'cd34';
  async function confirmedNotice(verify) {
    vi.stubGlobal('fetch', vi.fn(() =>
      ok({
        settlement: shareSettlement({ status: 'confirmed', confirmedAt: '2026-09-26T09:00:00Z', frozen: true }),
        link: { expiresAt: '2026-10-03T00:00:00Z', firstViewedAt: '2026-09-26T00:00:00Z' },
        verify,
      })
    ));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/share/settlement/:token', component: SharedSettlement }],
    });
    router.push('/share/settlement/tok');
    await router.isReady();
    const wrapper = mount(SharedSettlement, { global: { plugins: [router] } });
    await flushPromises();
    return wrapper.find('[data-test="confirmed-notice"]');
  }
  afterEach(() => vi.unstubAllGlobals());

  it('확정 배너 옆에 정산서 동결 뱃지, 변조면 변경 감지', async () => {
    expect((await confirmedNotice({ ok: true, storedHash: hash, currentHash: hash })).text()).toContain(
      '정산서 동결 · SHA-256 ab12…cd34 · 확정 이후 변경 없음'
    );
    expect((await confirmedNotice({ ok: false, storedHash: hash, currentHash: 'ff' })).text()).toContain('변경 감지');
  });
});

// ── 임대인 정산 화면: 보류 배너 · 이의 내용 · 임대인 부담으로 돌리기 ──
describe('SettlementView 보류 표시 (창 11)', () => {
  const objected = {
    itemCode: 'LIVING_WALLPAPER', zone: '거실', name: '벽지', tier: 'core', from: 'normal', to: 'damaged', evidence: 'high',
    estimateCost: 480000, payer: 'tenant', tenantAmount: 480000, landlordAmount: 0, holdAmount: 0,
    basis: { type: 'standard', clauseNo: null, stdAmount: 320000, residual: 0.6667 },
    tenantResponse: 'object', tenantResponseText: '입주 때부터 얼룩', tenantResponseImage: null, tenantRespondedAt: '2026-09-26T01:00:00Z',
  };
  const base = {
    id: 1, unitId: 1, moveInReportId: 3, moveOutReportId: 7, status: 'hold', moveInDate: '2024-03-02', moveOutDate: '2026-03-02',
    elapsedMonths: 24, items: [objected], fees: [], manualClauses: [], displayClauses: [],
    totals: { tenantTotal: 480000, landlordTotal: 0, holdTotal: 0, deposit: null, depositReturn: null },
    shareLink: { token: 't', path: '/share/settlement/t', expiresAt: '2026-10-03T00:00:00Z', expired: false, firstViewedAt: null },
  };
  let fetchMock;
  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/settlements') && opts.method === 'POST') return ok({ settlement: base });
      if (url.includes('/items/LIVING_WALLPAPER') && opts.method === 'PATCH') {
        return ok({ settlement: { ...base, status: 'draft', items: [{ ...objected, payer: 'landlord', tenantAmount: 0, landlordAmount: 480000 }] } });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('보류 배너와 이의 내용을 보여 주고, 확정은 막고, 임대인 부담으로 돌리면 배너가 사라진다', async () => {
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

    expect(wrapper.find('[data-test="status-banner"]').text()).toContain('정산 보류 · 임차인 이의 1건');
    expect(wrapper.find('[data-test="tenant-response"]').text()).toContain('입주 때부터 얼룩');
    expect(wrapper.find('[data-test="confirm-settlement"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="cost-input"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="move-to-landlord"]').trigger('click');
    await flushPromises();
    const patch = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ payer: 'landlord' });
    expect(wrapper.find('[data-test="status-banner"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="move-to-landlord"]').exists()).toBe(false);
  });
});
