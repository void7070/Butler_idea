import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import TenantReportReview from '../src/views/TenantReportReview.vue';
import TenantBaselineActions from '../src/components/TenantBaselineActions.vue';
import { setUser } from '../src/stores/session.js';
import {
  statusBadge,
  deadlineBadge,
  windowText,
  countByStatus,
  sortReports,
  zoneCells,
  itemsOfZone,
  reportFormError,
  reportPayload,
} from '../src/lib/tenantReportView.js';

const win = (daysLeft) => ({ startDate: '2024-03-02', deadline: '2024-03-09', open: daysLeft >= 0, daysLeft });
const tr = (id, status, extra = {}) => ({
  id, reportId: 4, itemCode: 'ROOM1_DOOR', zone: '방1', name: '문·문틀', tier: 'core', state: 'minor',
  text: '방1 문 하단 긁힘', imageBase64: null, status, createdAt: '2024-03-08 21:00:00', decidedAt: null, ...extra,
});

describe('tenantReportView 순수 로직', () => {
  it('deadlineBadge: D-n / D-DAY / 마감', () => {
    expect(deadlineBadge(win(4))).toMatchObject({ label: 'D-4', open: true });
    expect(deadlineBadge(win(0))).toMatchObject({ label: 'D-DAY', open: true });
    expect(deadlineBadge(win(-1))).toMatchObject({ label: '제보 마감', open: false });
    expect(windowText(win(-1))).toBe('제보 기간이 끝났습니다 (2024-03-02 ~ 2024-03-09)');
  });

  it('statusBadge, countByStatus, sortReports(대기 먼저)', () => {
    expect(statusBadge('approved').label).toBe('승인 · 입주 기준선 반영');
    const list = [tr(1, 'approved'), tr(2, 'rejected'), tr(3, 'pending')];
    expect(countByStatus(list)).toEqual({ pending: 1, approved: 1, rejected: 1 });
    expect(sortReports(list).map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it('zoneCells, itemsOfZone', () => {
    expect(zoneCells([{ zone: '베란다', tenantConfirmed: false }])[0]).toMatchObject({ zone: '베란다', label: '미확인' });
    const catalog = { items: [{ code: 'A', zone: '방1' }, { code: 'B', zone: '거실' }] };
    expect(itemsOfZone(catalog, '방1').map((i) => i.code)).toEqual(['A']);
  });

  it('reportFormError / reportPayload', () => {
    const form = { itemCode: 'BATHROOM_SILICONE', state: 'minor', text: '  실리콘 변색 ', imageBase64: '' };
    expect(reportFormError({ ...form, itemCode: '' })).toBe('항목을 고르세요.');
    expect(reportFormError({ ...form, text: ' ' })).toBe('내용을 입력하세요.');
    expect(reportFormError(form)).toBe('');
    expect(reportPayload(form)).toEqual({ itemCode: 'BATHROOM_SILICONE', state: 'minor', text: '실리콘 변색' });
  });
});

const ok = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) });
const listData = (reports, window = win(4)) => ({
  reportId: 4,
  window,
  zones: ['현관', '베란다'].map((zone) => ({ zone, authorConfirmed: true, tenantConfirmed: zone !== '베란다' })),
  unconfirmedZones: ['베란다'],
  tenantReports: reports,
});

describe('입주 제보 승인 화면 (임대인)', () => {
  let fetchMock;
  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    fetchMock = vi.fn((url, opts = {}) => {
      if (url.endsWith('/api/reports/4/tenant-reports')) return ok(listData([tr(1, 'approved'), tr(2, 'pending')]));
      if (url.endsWith('/api/tenant-reports/2/approve') && opts.method === 'POST') return ok({ tenantReport: tr(2, 'approved') });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('마감 D-n, 미확인 구역, 대기 제보 승인', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/owner/reports/:id/tenant-reports', component: TenantReportReview },
        { path: '/owner/reports/:id', component: { template: '<div />' } },
      ],
    });
    router.push('/owner/reports/4/tenant-reports');
    await router.isReady();
    const wrapper = mount(TenantReportReview, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-test="deadline"]').text()).toBe('D-4');
    expect(wrapper.find('[data-test="unconfirmed"]').text()).toContain('미확인 구역 1');
    expect(wrapper.find('[data-test="unconfirmed"]').text()).toContain('베란다');
    const cards = wrapper.findAll('[data-test="tenant-report-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].find('[data-test="approve"]').exists()).toBe(true); // 대기 먼저
    expect(cards[1].find('[data-test="approve"]').exists()).toBe(false);

    await cards[0].find('[data-test="approve"]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some(([u, o]) => u.endsWith('/api/tenant-reports/2/approve') && o.method === 'POST')).toBe(true);
    expect(wrapper.find('[data-test="counts"]').text()).toContain('승인 2');
    expect(wrapper.find('[data-test="approve"]').exists()).toBe(false);
  });
});

describe('임차인 이상 제보·구역 확인', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('마감이 지나면 버튼이 비활성', async () => {
    setUser({ id: 3, role: 'tenant', name: '박임차' });
    vi.stubGlobal('fetch', vi.fn(() => ok(listData([], win(-900)))));
    const wrapper = mount(TenantBaselineActions, { props: { reportId: 4 } });
    await flushPromises();
    expect(wrapper.find('[data-test="deadline"]').text()).toBe('제보 마감');
    expect(wrapper.find('[data-test="open-report"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="open-zones"]').attributes('disabled')).toBeDefined();
  });

  it('기간 안: 구역 확인 버튼 → POST zone-confirm', async () => {
    setUser({ id: 3, role: 'tenant', name: '박임차' });
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/zone-confirm')) {
        return ok({ zones: [{ zone: '현관', tenantConfirmed: true }, { zone: '베란다', tenantConfirmed: true }], unconfirmedZones: [] });
      }
      return ok(listData([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(TenantBaselineActions, { props: { reportId: 4 } });
    await flushPromises();
    await wrapper.find('[data-test="open-zones"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="zone-panel"] button').trigger('click');
    await flushPromises();
    const call = fetchMock.mock.calls.find(([u]) => u.endsWith('/api/reports/4/zone-confirm'));
    expect(JSON.parse(call[1].body)).toEqual({ zone: '베란다' });
    expect(wrapper.find('[data-test="open-zones"]').text()).toContain('2/2');
  });
});
