import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import LeaseForm from '../src/views/LeaseForm.vue';
import TenantReports from '../src/views/TenantReports.vue';
import { setUser } from '../src/stores/session.js';
import {
  emptyLeaseForm,
  parseWon,
  toggleTemplateClause,
  isTemplateSelected,
  addTextClause,
  removeClause,
  clausePreview,
  validateLeaseForm,
  hasFormErrors,
  buildLeasePayload,
  pendingLeases,
  leaseConfirmBadge,
} from '../src/lib/leaseForm.js';

const TEMPLATES = [
  {
    code: 'WALLPAPER_FLOOR_FULL',
    title: '도배·장판 기간 내 훼손 전액 부담',
    applyMode: 'auto',
    defaultParams: { withinMonths: 24 },
    defaultText: '입주 후 24개월 이내 벽지·바닥재 훼손 시 임차인이 복구 비용 전액을 부담한다.',
  },
  {
    code: 'CLEANING_FEE',
    title: '퇴거 청소비',
    applyMode: 'auto',
    defaultParams: { amount: 200000 },
    defaultText: '퇴거 시 청소비 200,000원은 임차인이 부담한다.',
  },
  { code: 'AIRCON_CLEANING', title: '에어컨 청소', applyMode: 'display', defaultParams: {}, defaultText: '퇴거 시 에어컨 청소는 임차인이 한다.' },
];
const [WALL, CLEAN] = TEMPLATES;

const filledForm = () => {
  let clauses = toggleTemplateClause([], WALL);
  clauses = toggleTemplateClause(clauses, CLEAN);
  clauses = addTextClause(clauses);
  clauses[1].params.amount = '150,000';
  clauses[2].text = '  반려동물은 소형견 1마리만 허용한다. ';
  return {
    tenantUserId: '3',
    deposit: '30,000,000',
    monthlyRent: '900000',
    startDate: '2026-04-01',
    endDate: '2028-04-01',
    clauses,
  };
};

describe('leaseForm (순수)', () => {
  it('parseWon: 쉼표·원 허용, 숫자 아님은 null', () => {
    expect(parseWon('30,000,000')).toBe(30000000);
    expect(parseWon('900000원')).toBe(900000);
    expect(parseWon(0)).toBe(0);
    expect(parseWon('')).toBeNull();
    expect(parseWon('3만')).toBeNull();
    expect(parseWon('-5')).toBe(-5);
  });

  it('템플릿 칩: 한 번 누르면 추가(기본 파라미터), 다시 누르면 빠짐', () => {
    let c = toggleTemplateClause([], CLEAN);
    expect(c).toEqual([{ kind: 'template', templateCode: 'CLEANING_FEE', params: { amount: '200000' } }]);
    expect(isTemplateSelected(c, 'CLEANING_FEE')).toBe(true);
    c = toggleTemplateClause(addTextClause(c), CLEAN);
    expect(c).toEqual([{ kind: 'text', text: '' }]);
    expect(removeClause(c, 0)).toEqual([]);
  });

  it('미리보기: 기본값을 입력값으로 바꾸고, 잘못된 값이면 기본 문구', () => {
    expect(clausePreview(CLEAN, { amount: '150,000' })).toBe('퇴거 시 청소비 150,000원은 임차인이 부담한다.');
    expect(clausePreview(WALL, { withinMonths: '12' })).toContain('12개월 이내');
    expect(clausePreview(CLEAN, { amount: 'abc' })).toBe(CLEAN.defaultText);
  });

  it('페이로드: 숫자 변환, 자유 문장 trim, 순서 유지', () => {
    const form = filledForm();
    expect(hasFormErrors(validateLeaseForm(form))).toBe(false);
    expect(buildLeasePayload(form)).toEqual({
      tenantUserId: 3,
      deposit: 30000000,
      monthlyRent: 900000,
      startDate: '2026-04-01',
      endDate: '2028-04-01',
      clauses: [
        { templateCode: 'WALLPAPER_FLOOR_FULL', params: { withinMonths: 24 } },
        { templateCode: 'CLEANING_FEE', params: { amount: 150000 } },
        { text: '반려동물은 소형견 1마리만 허용한다.' },
      ],
    });
  });

  it('검증: 빈 폼, 음수, 날짜 순서, 빈 특약 문장, 잘못된 파라미터', () => {
    const empty = validateLeaseForm(emptyLeaseForm());
    expect(Object.keys(empty).sort()).toEqual(['clauses', 'deposit', 'monthlyRent', 'period', 'tenantUserId']);
    expect(hasFormErrors(empty)).toBe(true);

    const form = filledForm();
    form.deposit = '-1';
    form.endDate = '2026-04-01';
    form.clauses[1].params.amount = '';
    form.clauses[2].text = '   ';
    const e = validateLeaseForm(form);
    expect(e.deposit).toBeTruthy();
    expect(e.period).toBe('계약 종료일은 시작일보다 뒤여야 합니다.');
    expect(Object.keys(e.clauses)).toEqual(['1', '2']);
    expect(e.monthlyRent).toBeUndefined();
  });

  it('확인할 계약·뱃지', () => {
    const leases = [
      { id: 1, tenantConfirmed: true, clauses: [{}] },
      { id: 2, tenantConfirmed: false, clauses: [{}] },
    ];
    expect(pendingLeases(leases).map((l) => l.id)).toEqual([2]);
    expect(leaseConfirmBadge(leases[0]).text).toBe('임차인 확인 완료');
    expect(leaseConfirmBadge(leases[1]).text).toBe('임차인 확인 전');
    expect(leaseConfirmBadge({ tenantConfirmed: true, clauses: [] }).text).toBe('특약 없음');
  });
});

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });

describe('LeaseForm 화면', () => {
  let fetchMock;
  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/units')) return ok({ units: [{ id: 1, name: '1234호' }] });
      if (url.endsWith('/api/demo/users')) return ok({ users: [{ id: 2, name: '김임대', role: 'owner' }, { id: 3, name: '박임차', role: 'tenant' }] });
      if (url.endsWith('/api/clause-templates')) return ok({ templates: TEMPLATES });
      if (url.endsWith('/api/units/1/leases') && opts.method === 'POST') return ok({ lease: { id: 9 } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('임차인 선택지는 tenant만, 칩 → 미리보기, 등록하면 POST 후 이력으로 이동', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/owner/units/:id/leases/new', component: LeaseForm },
        { path: '/owner/units/:id/leases', name: 'owner-leases', component: { template: '<div />' } },
      ],
    });
    router.push('/owner/units/1/leases/new');
    await router.isReady();
    const wrapper = mount(LeaseForm, { global: { plugins: [router] } });
    await flushPromises();

    const options = wrapper.find('[data-test="tenant"]').findAll('option').map((o) => o.text());
    expect(options).toEqual(['선택하세요', '박임차']);
    expect(wrapper.text()).toContain('특약 효력은 법률 검토가 필요할 수 있습니다.');

    await wrapper.findAll('[data-test="template-chip"]')[1].trigger('click');
    expect(wrapper.find('[data-test="clause-preview"]').text()).toContain('200,000원');

    await wrapper.find('[data-test="tenant"]').setValue('3');
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('30,000,000');
    await inputs[1].setValue('900000');
    await inputs[2].setValue('2026-04-01');
    await inputs[3].setValue('2028-04-01');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const post = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({
      tenantUserId: 3,
      deposit: 30000000,
      clauses: [{ templateCode: 'CLEANING_FEE', params: { amount: 200000 } }],
    });
    expect(router.currentRoute.value.path).toBe('/owner/units/1/leases');
  });
});

describe('TenantReports 확인할 계약', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('미확인 계약 카드 → 확인 버튼 → 카드 사라짐', async () => {
    setUser({ id: 3, role: 'tenant', name: '박임차' });
    const pending = {
      id: 5,
      tenantConfirmed: false,
      startDate: '2026-04-01',
      endDate: '2028-04-01',
      deposit: 30000000,
      monthlyRent: 900000,
      clauses: [{ id: 1, clauseNo: 1, applyMode: 'manual', text: '반려동물은 소형견 1마리만 허용한다.' }],
    };
    const fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/reports')) return ok({ reports: [] });
      if (url.endsWith('/api/units')) return ok({ units: [{ id: 1, name: '1234호' }] });
      if (url.endsWith('/api/units/1/leases')) return ok({ leases: [pending, { id: 1, tenantConfirmed: true, clauses: [] }] });
      if (url.endsWith('/api/leases/5/confirm') && opts.method === 'POST') return ok({ lease: { ...pending, tenantConfirmed: true } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    const wrapper = mount(TenantReports, { global: { plugins: [router] } });
    await flushPromises();

    const cards = wrapper.findAll('[data-test="pending-lease"]');
    expect(cards).toHaveLength(1);
    expect(cards[0].text()).toContain('1234호');
    expect(cards[0].text()).toContain('반려동물은 소형견 1마리만 허용한다.');
    await cards[0].find('button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-test="pending-lease"]')).toHaveLength(0);
  });
});
