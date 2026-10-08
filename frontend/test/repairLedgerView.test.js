import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RepairLedger from '../src/views/RepairLedger.vue';
import { setUser } from '../src/stores/session.js';
import {
  TAX_NOTICE,
  ledgerQuery,
  csvFilename,
  reasonClass,
  pendingStatusLabel,
  filterLabel,
  hasTampered,
} from '../src/lib/repairLedgerView.js';

const UNITS = [
  { id: 1, name: '1234호' },
  { id: 2, name: '345호' },
];

describe('repairLedgerView 순수 로직 (창 16)', () => {
  it('쿼리·파일 이름·필터 문구', () => {
    expect(ledgerQuery({})).toBe('');
    expect(ledgerQuery({ year: '', unitId: '' })).toBe('');
    expect(ledgerQuery({ year: 2026, unitId: 1 })).toBe('?year=2026&unitId=1');
    expect(csvFilename({ year: 2026, unitId: 1 }, UNITS)).toBe('수선비장부_2026_1234호.csv');
    expect(csvFilename({}, UNITS)).toBe('수선비장부.csv');
    expect(filterLabel({ year: '', unitId: 2 }, UNITS)).toBe('전체 연도 · 345호');
  });

  it('사유 색·예정 상태·변조 표시', () => {
    expect(reasonClass('소액 일괄')).toContain('text-seal');
    expect(reasonClass('모르는 사유')).toBe(reasonClass('임대인 선택'));
    expect(pendingStatusLabel('hold')).toBe('정산 보류');
    expect(pendingStatusLabel('draft')).toBe('합의 전');
    expect(hasTampered([{ hashOk: true }, { hashOk: null }])).toBe(false);
    expect(hasTampered([{ hashOk: false }])).toBe(true);
  });
});

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });

describe('RepairLedger 화면', () => {
  let calls;
  const DATA = {
    rows: [
      { date: '2026-09-26', unitId: 1, unitName: '1234호', zone: '주방', itemCode: 'KITCHEN_HOOD_FILTER', itemName: '후드 필터', amount: 60000, reason: '자연 마모 후보', settlementId: 1, hashOk: true },
      { date: '2026-09-26', unitId: 1, unitName: '1234호', zone: '베란다', itemCode: 'BALCONY_SCREEN', itemName: '방충망', amount: 45000, reason: '소액 일괄', settlementId: 1, hashOk: true },
    ],
    pending: [{ unitId: 2, unitName: '345호', zone: '거실', itemCode: 'X', itemName: '벽지', amount: 30000, reason: '임대인 선택', settlementId: 2, status: 'draft' }],
    totals: { byUnit: [{ unitId: 1, unitName: '1234호', total: 105000, count: 2 }], byYear: [{ year: 2026, total: 105000, count: 2 }], total: 105000 },
    years: [2026],
    units: UNITS,
  };

  beforeEach(() => {
    setUser({ id: 2, role: 'owner', name: '김임대' });
    calls = [];
    vi.stubGlobal('fetch', vi.fn((url) => {
      calls.push(url);
      return ok(DATA);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('표·합계·예정·고지, 필터를 바꾸면 쿼리로 다시 부른다', async () => {
    const wrapper = mount(RepairLedger);
    await flushPromises();
    expect(wrapper.find('[data-test="tax-notice"]').text()).toContain(TAX_NOTICE);
    expect(wrapper.findAll('[data-test="ledger-row"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="ledger-total"]').text()).toBe('105,000원');
    expect(wrapper.find('[data-test="by-unit"]').text()).toContain('1234호');
    const pending = wrapper.findAll('[data-test="pending-row"]');
    expect(pending).toHaveLength(1);
    expect(pending[0].text()).toContain('예정');
    expect(wrapper.find('[data-test="tampered"]').exists()).toBe(false);

    await wrapper.find('[data-test="year-filter"]').setValue('2026');
    await flushPromises();
    expect(calls.at(-1)).toMatch(/\/api\/owner\/repair-ledger\?year=2026$/);
  });
});
