import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ReportSnapshotView from '../src/components/ReportSnapshotView.vue';

const snapshot = {
  reportId: 1,
  grade: 'B',
  generatedAt: '2026-05-30 12:00:00',
  inspection: { id: 1, type: 'periodic', typeLabel: '정기 점검', flow: 'whole' },
  unit: { id: 1, name: '1234호', building: '노원 그린아파트', address: '서울' },
  parties: { contractor: { name: '이시공' }, owner: { name: '김임대' }, tenant: null },
  items: [{ category: '거실', name: '창호', state: 'caution', location: '베란다측', description: '실리콘 들뜸' }],
  observations: [{ label: '곰팡이', value: 'present' }],
  images: [{ data_base64: 'data:image/png;base64,AAAA', kind: '근접', caption: '창틀' }],
  aiGuide: { summary: 'AI 요약입니다' },
  finalOpinion: '경과 관찰 권장',
  caution: '법적 책임을 판단하지 않습니다.',
};

describe('ReportSnapshotView', () => {
  it('스냅샷 주요 필드를 렌더', () => {
    const w = mount(ReportSnapshotView, { props: { snapshot } });
    const text = w.text();
    expect(text).toContain('1234호');
    expect(text).toContain('B등급');
    expect(text).toContain('정기 점검');
    expect(text).toContain('이시공');
    expect(text).toContain('주의'); // state 라벨
    expect(text).toContain('있음'); // observation 라벨
    expect(text).toContain('경과 관찰 권장');
    expect(w.findAll('img')).toHaveLength(1);
  });

  it('tenant 없으면 - 표시', () => {
    const w = mount(ReportSnapshotView, { props: { snapshot } });
    expect(w.text()).toContain('임차인 -');
  });
});
