import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import HouseLog from '../src/views/HouseLog.vue';
import { setUser } from '../src/stores/session.js';
import {
  kindMeta,
  filterEvents,
  leaseSections,
  integritySummary,
  integrityChip,
  eventDate,
  countText,
  houseLogPath,
} from '../src/lib/houseLogView.js';

// 백엔드 GET /api/units/:id/house-log 모양 (시연 1234호 요약)
const LOG = {
  unit: { id: 1, name: '1234호' },
  leases: [
    { id: 1, range: '2024-03-02 ~ 2026-03-02', tenantName: '박임차' },
    { id: 2, range: '2026-10-01 ~ 2028-10-01', tenantName: '최임차' },
  ],
  events: [
    { at: '2024-03-01T15:00:00.000Z', kind: 'lease_start', title: '계약 시작', detail: '보증금', leaseId: 1, link: '/owner/units/1/leases', integrity: null },
    { at: '2024-03-02T10:00:00.000Z', kind: 'report', title: '입주 전 리포트 발행', detail: 'A등급 · 이상 3건', leaseId: 1, link: '/owner/reports/4', integrity: { ok: true, shortHash: 'abcdef12' } },
    { at: '2024-03-04T20:00:00.000Z', kind: 'tenant_report', title: '입주 제보 · 신발장', detail: '경미 · 승인', leaseId: 1, link: null, integrity: null },
    { at: '2026-09-27T03:00:00.000Z', kind: 'settlement_confirmed', title: '정산 합의 확정', detail: '임차인 청구 770,000원', leaseId: 1, link: null, integrity: { ok: true, shortHash: 'ffeeddcc' } },
    { at: '2026-09-27T03:00:00.000Z', kind: 'ledger', title: '수선비 장부 반영 · 방충망', detail: '45,000원', leaseId: 1, link: null, integrity: null },
    { at: '2026-09-30T15:00:00.000Z', kind: 'lease_start', title: '계약 시작', detail: '보증금', leaseId: 2, link: null, integrity: null },
  ],
};

describe('houseLogView (순수)', () => {
  it('종류 → 아이콘·필터 그룹, 모르는 종류는 기본값', () => {
    expect(kindMeta('report')).toMatchObject({ group: 'inspection', label: '점검' });
    expect(kindMeta('ledger').group).toBe('settlement');
    expect(kindMeta('lease_end').group).toBe('lease');
    expect(kindMeta('???')).toMatchObject({ group: 'other' });
  });

  it('필터: 전체 / 점검 / 정산 / 계약', () => {
    expect(filterEvents(LOG.events, 'all')).toHaveLength(6);
    expect(filterEvents(LOG.events, 'inspection').map((e) => e.kind)).toEqual(['report', 'tenant_report']);
    expect(filterEvents(LOG.events, 'settlement').map((e) => e.kind)).toEqual(['settlement_confirmed', 'ledger']);
    expect(filterEvents(LOG.events, 'lease')).toHaveLength(2);
  });

  it('계약별 구획: 제목(기간 · 임차인), 필터 중에는 빈 구획 숨김, 계약 없는 이벤트는 맨 뒤', () => {
    const all = leaseSections(LOG);
    expect(all.map((s) => s.title)).toEqual(['2024-03-02 ~ 2026-03-02 · 임차인 박임차', '2026-10-01 ~ 2028-10-01 · 임차인 최임차']);
    expect(all.map((s) => s.events.length)).toEqual([5, 1]);
    expect(leaseSections(LOG, 'settlement').map((s) => s.key)).toEqual(['lease-1']);
    const orphan = leaseSections({ ...LOG, events: [...LOG.events, { at: 'x', kind: 'report', leaseId: null }] });
    expect(orphan.at(-1)).toMatchObject({ title: '계약 없음', events: [{ leaseId: null }] });
    expect(leaseSections(null)).toEqual([]);
  });

  it('해시 요약: 모두 정상이면 초록 n/n, 하나라도 실패면 빨강', () => {
    expect(integritySummary(LOG.events)).toMatchObject({ allOk: true, ok: 2, total: 2, text: '🔒 모든 리포트·정산서 해시 검증 2/2 정상' });
    const bad = LOG.events.map((e) => (e.kind === 'report' ? { ...e, integrity: { ok: false, shortHash: 'abcdef12' } } : e));
    const s = integritySummary(bad);
    expect(s).toMatchObject({ allOk: false, text: '⚠ 해시 검증 1/2 정상 · 1건 변경 감지' });
    expect(s.class).toContain('crit');
    expect(integritySummary([])).toMatchObject({ total: 0, text: '해시 검증 대상 없음' });
  });

  it('무결성 칩·날짜·건수·경로', () => {
    expect(integrityChip(null)).toBeNull();
    expect(integrityChip({ ok: true, shortHash: 'abcdef12' }).text).toBe('🔒 abcdef12');
    expect(integrityChip({ ok: false, shortHash: 'abcdef12' })).toMatchObject({ text: '⚠ 변경 감지', class: expect.stringContaining('crit') });
    const d = new Date(2024, 2, 2, 19, 5);
    expect(eventDate(d.toISOString())).toEqual({ date: '2024-03-02', time: '19:05' });
    expect(countText(LOG.events)).toBe('기록 6건');
    expect(houseLogPath('owner', 1)).toBe('/owner/units/1/house-log');
    expect(houseLogPath('tenant', 2)).toBe('/tenant/units/2/house-log');
  });
});

describe('HouseLog 화면', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function mountLog(data, path = '/owner/units/1/house-log') {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) })));
    const stub = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/owner/units/:id/house-log', component: HouseLog },
        { path: '/tenant/units/:id/house-log', component: HouseLog },
        { path: '/:rest(.*)*', component: stub },
      ],
    });
    router.push(path);
    await router.isReady();
    const wrapper = mount(HouseLog, { global: { plugins: [router] } });
    await flushPromises();
    return wrapper;
  }

  it('요약·계약별 구획·이벤트, 필터 칩으로 좁히기, link 있는 이벤트는 링크', async () => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    const w = await mountLog(LOG);
    expect(w.text()).toContain('1234호');
    expect(w.find('[data-test="event-count"]').text()).toContain('기록 6건');
    expect(w.find('[data-test="integrity-summary"]').attributes('data-ok')).toBe('true');
    expect(w.findAll('[data-test="lease-section"]')).toHaveLength(2);
    expect(w.findAll('[data-test="event"]')).toHaveLength(6);
    expect(w.findAll('[data-test="integrity-chip"]')).toHaveLength(2);
    expect(w.find('a[href="/owner/reports/4"]').exists()).toBe(true);

    await w.find('[data-test="filter-settlement"]').trigger('click');
    expect(w.findAll('[data-test="lease-section"]')).toHaveLength(1);
    expect(w.findAll('[data-test="event"]').map((e) => e.text())).toEqual([
      expect.stringContaining('정산 합의 확정'),
      expect.stringContaining('수선비 장부 반영'),
    ]);
  });

  it('해시 실패가 있으면 빨간 요약, 임차인은 안내 문구', async () => {
    setUser({ id: 3, role: 'tenant', name: '박임차' });
    const events = LOG.events.map((e) => (e.kind === 'report' ? { ...e, integrity: { ok: false, shortHash: 'x' } } : e));
    const w = await mountLog({ ...LOG, events }, '/tenant/units/1/house-log');
    const summary = w.find('[data-test="integrity-summary"]');
    expect(summary.attributes('data-ok')).toBe('false');
    expect(summary.text()).toContain('1건 변경 감지');
    expect(w.text()).toContain('본인 계약 기간의 기록만');
  });
});
