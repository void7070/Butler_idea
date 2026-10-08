import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { splitNum } from '../src/lib/numText.js';
import NumText from '../src/components/ui/NumText.vue';

const nums = (s) => splitNum(s).filter((p) => p.num).map((p) => p.text);

describe('창 28 숫자 글꼴 분리', () => {
  it('splitNum: 이어 붙이면 원래 문자열', () => {
    for (const s of ['제보 기간 2024-03-02 ~ 2024-03-09', '오후 10:56:34', '참고: 표준 기준 320,000원', '', '변경 감지']) {
      expect(splitNum(s).map((p) => p.text).join('')).toBe(s);
    }
    expect(splitNum(null)).toEqual([]);
  });

  it('splitNum: 날짜·시각·금액·퍼센트·D-day만 숫자 조각', () => {
    expect(nums('제보 기간 2024-03-02 ~ 2024-03-09')).toEqual(['2024-03-02', '2024-03-09']);
    expect(nums('오후 10:56:34')).toEqual(['10:56:34']);
    expect(nums('적용 기준: 표준 기준 · 내구연수 5년 · 잔존 60%')).toEqual(['5', '60%']);
    expect(nums('임대인 부담 → 수선비 장부 105,000원')).toEqual(['105,000원']);
    expect(nums('D+208 지남')).toEqual(['D+208']);
    expect(nums('D-DAY')).toEqual(['D-DAY']);
    expect(nums('계약 정보 없음')).toEqual([]);
  });

  it('NumText: 문구 그대로, 숫자만 .num', () => {
    const w = mount({ components: { NumText }, template: '<p><NumText text="저장됨 오후 10:56:34" /></p>' });
    expect(w.text()).toBe('저장됨 오후 10:56:34');
    expect(w.findAll('.num').map((s) => s.text())).toEqual(['10:56:34']);
  });
});
