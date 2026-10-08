import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import OwnerHome from '../src/views/OwnerHome.vue';
import ReportCompareView from '../src/views/ReportCompareView.vue';
import { setUser } from '../src/stores/session.js';
import {
  formatToday,
  todoCountText,
  ddayChip,
  moveReportPair,
  compareLink,
  todoLink,
  comparePreselect,
  leaseStatusBadge,
  nextDueText,
  unitLinks,
  isNavActive,
  OWNER_NAV,
} from '../src/lib/ownerHome.js';

// 시연 시드와 같은 모양 (GET /api/reports, id 내림차순)
const REPORTS = [
  { id: 6, type: 'move_in', unitName: '345호', createdAt: '2026-09-24 10:00:00' },
  { id: 5, type: 'move_out_post', unitName: '1234호', createdAt: '2026-03-02 10:00:00' },
  { id: 4, type: 'move_in', unitName: '1234호', createdAt: '2024-03-02 10:00:00' },
  { id: 3, type: 'move_in', unitName: '345호', createdAt: '2026-09-26 14:45:13' },
  { id: 2, type: 'periodic', unitName: '1234호', createdAt: '2026-09-26 14:45:13' },
];

const TODOS = [
  {
    kind: 'move_out', unitId: 1, unitName: '1234호', title: '퇴거 점검과 보증금 공제 준비',
    detail: '계약 종료 2026-03-02', dueDate: '2026-03-02', dday: -208, severity: 'crit', link: '/owner/compare',
  },
  {
    kind: 'lease_unconfirmed', unitId: 2, unitName: '345호', title: '임차인 특약 확인 대기',
    detail: '최임차 · 계약 2026-09-24 ~ 2028-09-24', dueDate: null, dday: null, severity: 'warn', link: '/owner/units/2/leases',
  },
  {
    kind: 'report_window', unitId: 2, unitName: '345호', title: '입주 제보 승인 대기 0건 · 미확인 구역 7',
    detail: '마감 D-5 (2026-10-01까지)', dueDate: '2026-10-01', dday: 5, severity: 'calm', link: '/owner/reports/6/tenant-reports',
  },
];

describe('ownerHome 문구·칩', () => {
  it('날짜와 건수 문구', () => {
    expect(formatToday(null, new Date(2026, 8, 26))).toBe('2026년 9월 26일 (토)');
    // 서버 today(시연 기준일)가 있으면 브라우저 날짜 대신 그 날짜
    expect(formatToday('2026-09-27', new Date(2030, 0, 1))).toBe('2026년 9월 27일 (일)');
    expect(formatToday('잘못된 값', new Date(2026, 8, 26))).toBe('2026년 9월 26일 (토)');
    expect(todoCountText(TODOS)).toBe('오늘 확인할 일 3건');
    expect(todoCountText([])).toBe('오늘 확인할 일이 없습니다');
  });

  it('D-day 칩: crit 빨강 / warn 주황 / calm 회색, 지남·당일·기한 없음', () => {
    expect(ddayChip({ severity: 'crit', dday: -208 })).toMatchObject({ label: 'D+208 지남', class: expect.stringContaining('crit') });
    expect(ddayChip({ severity: 'warn', dday: null })).toMatchObject({ label: '확인 필요', class: expect.stringContaining('warn') });
    expect(ddayChip({ severity: 'calm', dday: 5 })).toMatchObject({ label: 'D-5', class: expect.stringContaining('surface-2') });
    expect(ddayChip({ severity: 'warn', dday: 0 }).label).toBe('D-DAY');
    expect(ddayChip({ severity: 'crit', dday: null }).label).toBe('바로 확인');
    expect(ddayChip({ severity: '???', dday: 1 }).severity).toBe('calm');
  });

  it('호실 상태 뱃지와 다음 기한', () => {
    expect(leaseStatusBadge('active').label).toBe('계약 중');
    expect(leaseStatusBadge('ended').label).toBe('계약 종료');
    expect(leaseStatusBadge(undefined).label).toBe('계약 없음');
    expect(nextDueText(null)).toBe('다가오는 기한 없음');
    expect(nextDueText({ title: '입주 제보 승인 대기', dueDate: '2026-10-01', dday: 5 })).toBe('입주 제보 승인 대기 · 2026-10-01 (D-5)');
    expect(nextDueText({ title: 'x', dueDate: '2026-09-26', dday: 0 })).toBe('x · 2026-09-26 (D-DAY)');
  });

  it('내비: 홈은 /owner만, 리포트는 나머지 /owner/...', () => {
    const [home, reports] = OWNER_NAV;
    expect(home).toEqual({ label: '홈', to: '/owner' });
    expect(reports).toEqual({ label: '리포트', to: '/owner/reports' });
    expect(isNavActive(home, '/owner')).toBe(true);
    expect(isNavActive(home, '/owner/reports')).toBe(false);
    expect(isNavActive(reports, '/owner/compare')).toBe(true);
    expect(isNavActive(reports, '/owner')).toBe(false);
    const ledger = OWNER_NAV[2];
    expect(ledger).toEqual({ label: '수선비 장부', to: '/owner/repair-ledger' });
    expect(isNavActive(ledger, '/owner/repair-ledger')).toBe(true);
    expect(isNavActive(reports, '/owner/repair-ledger')).toBe(false);
    expect(isNavActive(ledger, '/owner/reports')).toBe(false);
  });
});

describe('ownerHome 링크', () => {
  it('퇴거 카드 → 그 호실 입주·퇴거 리포트가 선택된 비교 화면', () => {
    expect(moveReportPair(REPORTS, '1234호')).toMatchObject({ moveIn: { id: 4 }, moveOut: { id: 5 } });
    expect(todoLink(TODOS[0], REPORTS)).toBe('/owner/compare?leftId=4&rightId=5');
  });

  it('입주는 퇴거 날짜 이전 것 중 최근, 퇴거 없으면 입주만, 둘 다 없으면 query 없음', () => {
    const reports = [...REPORTS, { id: 9, type: 'move_in', unitName: '1234호', createdAt: '2026-04-01 10:00:00' }];
    expect(compareLink(moveReportPair(reports, '1234호'))).toBe('/owner/compare?leftId=4&rightId=5');
    expect(compareLink(moveReportPair(REPORTS, '345호'))).toBe('/owner/compare?leftId=3');
    expect(compareLink(moveReportPair(REPORTS, '999호'))).toBe('/owner/compare');
  });

  it('제보·정산·특약 카드는 백엔드 link 그대로, 호실 카드 링크', () => {
    expect(todoLink(TODOS[1], REPORTS)).toBe('/owner/units/2/leases');
    expect(todoLink(TODOS[2], REPORTS)).toBe('/owner/reports/6/tenant-reports');
    const hold = { kind: 'settlement_hold', link: '/owner/settlement?moveInReportId=4&moveOutReportId=5' };
    expect(todoLink(hold, REPORTS)).toBe(hold.link);
    expect(unitLinks({ unitId: 1, unitName: '1234호' })).toEqual({
      leases: '/owner/units/1/leases',
      houseLog: '/owner/units/1/house-log',
      reports: `/owner/reports?unit=${encodeURIComponent('1234호')}`,
    });
  });

  it('비교 화면 query → 목록에 있는 id만 미리 선택', () => {
    expect(comparePreselect({ leftId: '4', rightId: '5' }, REPORTS)).toEqual({ leftId: 4, rightId: 5, ready: true });
    expect(comparePreselect({ leftId: '4', rightId: '77' }, REPORTS)).toEqual({ leftId: 4, rightId: '', ready: false });
    expect(comparePreselect({}, REPORTS)).toEqual({ leftId: '', rightId: '', ready: false });
  });
});

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });

function makeRouter(component, path) {
  const stub = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/owner', component: path === '/owner' ? component : stub },
      { path: '/owner/compare', component: path.startsWith('/owner/compare') ? component : stub },
      { path: '/:rest(.*)*', component: stub },
    ],
  });
}

describe('OwnerHome 화면', () => {
  let todosData;
  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    todosData = {
      todos: TODOS,
      units: [
        { unitId: 1, unitName: '1234호', leaseStatus: 'ended', tenantName: '박임차', nextDue: null },
        { unitId: 2, unitName: '345호', leaseStatus: 'active', tenantName: '최임차', nextDue: { kind: 'report_window', title: '입주 제보', dueDate: '2026-10-01', dday: 5 } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/owner/todos')) return ok(todosData);
      if (url.endsWith('/api/reports')) return ok({ reports: REPORTS });
      if (url.endsWith('/api/health')) return ok({ status: 'ok', today: '2026-09-27', demoToday: true });
      return Promise.reject(new Error(`unexpected ${url}`));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function mountHome() {
    const router = makeRouter(OwnerHome, '/owner');
    router.push('/owner');
    await router.isReady();
    const wrapper = mount(OwnerHome, { global: { plugins: [router] } });
    await flushPromises();
    return wrapper;
  }

  it('건수, 할 일 카드(칩·링크), 호실 현황', async () => {
    const wrapper = await mountHome();
    expect(wrapper.find('[data-test="todo-count"]').text()).toBe('오늘 확인할 일 3건');
    // 날짜는 브라우저가 아니라 서버 today(시연 기준일)
    expect(wrapper.find('[data-test="today"]').text()).toBe('2026년 9월 27일 (일)');
    const cards = wrapper.findAll('[data-test="todo-card"]');
    expect(cards).toHaveLength(3);
    expect(cards[0].attributes('href')).toBe('/owner/compare?leftId=4&rightId=5');
    expect(cards[0].find('[data-test="dday-chip"]').text()).toBe('D+208 지남');
    expect(cards[2].attributes('href')).toBe('/owner/reports/6/tenant-reports');
    const units = wrapper.findAll('[data-test="unit-card"]');
    expect(units[0].text()).toContain('계약 종료');
    expect(units[1].text()).toContain('최임차');
    expect(wrapper.find('[data-test="repair-ledger-link"]').attributes('href')).toBe('/owner/repair-ledger');
  });

  it('할 일이 없으면 안내 문구', async () => {
    todosData = { todos: [], units: [] };
    const wrapper = await mountHome();
    expect(wrapper.find('[data-test="no-todos"]').text()).toBe('오늘 확인할 일이 없습니다');
  });
});

describe('ReportCompareView query 미리 선택', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leftId·rightId가 있으면 선택하고 바로 비교, 없으면 호출 안 함', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/api/reports')) return ok({ reports: REPORTS.map((r) => ({ ...r, building: 'A', typeLabel: r.type, grade: 'A' })) });
      if (url.includes('/api/reports/compare')) return ok({ diff: null, compareMeta: {}, left: null, right: null });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter(ReportCompareView, '/owner/compare');
    router.push('/owner/compare?leftId=4&rightId=5');
    await router.isReady();
    const wrapper = mount(ReportCompareView, {
      global: { plugins: [router], stubs: { ReportSnapshotView: true, DiffView: true } },
    });
    await flushPromises();
    const selects = wrapper.findAll('select');
    expect(selects[0].element.value).toBe('4');
    expect(selects[1].element.value).toBe('5');
    expect(fetchMock.mock.calls.some(([u]) => u.includes('/api/reports/compare?leftId=4&rightId=5'))).toBe(true);

    fetchMock.mockClear();
    await router.push('/owner/compare');
    const plain = mount(ReportCompareView, { global: { plugins: [router] } });
    await flushPromises();
    expect(plain.findAll('select')[0].element.value).toBe('');
    expect(fetchMock.mock.calls.some(([u]) => u.includes('/compare?'))).toBe(false);
  });
});
