import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiGuidePanel from '../src/components/AiGuidePanel.vue';

const guide = {
  summary: '거실 창호 추가 확인 필요',
  actionCards: [{ title: '사진 보강', detail: '창틀 근접 촬영' }],
  requiredDocuments: ['창호 사진'],
  cautionPhrases: ['객관적 사실 위주 기록'],
  opinionDraft: '창호 실리콘 점검 권장',
};

describe('AiGuidePanel', () => {
  it('guide가 있으면 summary/카드/자료/주의를 렌더', () => {
    const w = mount(AiGuidePanel, { props: { guide } });
    const text = w.text();
    expect(text).toContain('거실 창호 추가 확인 필요');
    expect(text).toContain('사진 보강');
    expect(text).toContain('창호 사진');
    expect(text).toContain('객관적 사실 위주 기록');
  });

  it('호출 버튼 클릭 시 request emit', async () => {
    const w = mount(AiGuidePanel, { props: { guide: null } });
    await w.get('[data-test="request"]').trigger('click');
    expect(w.emitted('request')).toHaveLength(1);
  });

  it('적용 버튼 클릭 시 opinionDraft로 apply emit', async () => {
    const w = mount(AiGuidePanel, { props: { guide } });
    await w.get('[data-test="apply"]').trigger('click');
    expect(w.emitted('apply')[0]).toEqual(['창호 실리콘 점검 권장']);
  });

  it('fallback이면 안내 문구 표시', () => {
    const w = mount(AiGuidePanel, { props: { guide, fallback: true } });
    expect(w.text()).toContain('기본 안내');
  });
});
