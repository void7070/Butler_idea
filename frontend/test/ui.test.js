import { describe, it, expect } from 'vitest';
import { h } from 'vue';
import { mount, RouterLinkStub } from '@vue/test-utils';
import AppCard from '../src/components/ui/AppCard.vue';
import Pill from '../src/components/ui/Pill.vue';
import DdayChip from '../src/components/ui/DdayChip.vue';
import NumText from '../src/components/ui/NumText.vue';
import GradeChip from '../src/components/ui/GradeChip.vue';
import AppButton from '../src/components/ui/AppButton.vue';
import Banner from '../src/components/ui/Banner.vue';
import SegmentedControl from '../src/components/ui/SegmentedControl.vue';
import AppBar from '../src/components/ui/AppBar.vue';
import BottomTabBar from '../src/components/ui/BottomTabBar.vue';
import Chip from '../src/components/ui/Chip.vue';
import IntegrityBadge from '../src/components/IntegrityBadge.vue';

const stubs = { global: { stubs: { RouterLink: RouterLinkStub } } };

describe('공통 컴포넌트 (창 21)', () => {
  it('AppCard: 기본 카드 + 왼쪽 색 테두리 + 누르는 카드', () => {
    const plain = mount(AppCard, { slots: { default: '내용' } });
    expect(plain.element.tagName).toBe('DIV');
    expect(plain.classes()).toContain('rounded-card');
    expect(plain.text()).toBe('내용');

    const w = mount(AppCard, { props: { as: 'button', tap: true, edge: 'crit' } });
    expect(w.element.tagName).toBe('BUTTON');
    expect(w.classes()).toEqual(expect.arrayContaining(['border-l-crit', 'hover:border-accent']));
  });

  it('Pill: 색 이름별 클래스, 모르는 값은 plain', () => {
    expect(mount(Pill, { props: { tone: 'ok' }, slots: { default: '계약 중' } }).classes()).toContain('bg-ok-soft');
    expect(mount(Pill, { props: { tone: 'dark' } }).classes()).toContain('bg-ink');
    expect(mount(Pill, { props: { tone: 'x' } }).classes()).toContain('bg-surface-2');
  });

  it('DdayChip: 심각도 색, 숫자 부분만 mono (창 28)', () => {
    const w = mount(DdayChip, { props: { severity: 'warn' }, slots: { default: () => h(NumText, { text: 'D+3 지남' }) } });
    expect(w.classes()).toEqual(expect.arrayContaining(['bg-warn-soft', 'text-warn']));
    expect(w.classes()).not.toContain('num');
    expect(w.text()).toBe('D+3 지남');
    expect(w.find('.num').text()).toBe('D+3');
  });

  it('GradeChip: 등급 글자와 색', () => {
    const w = mount(GradeChip, { props: { grade: 'A' } });
    expect(w.text()).toBe('A');
    expect(w.classes()).toContain('bg-ok-soft');
    expect(mount(GradeChip, { props: { grade: 'E' } }).classes()).toContain('bg-crit-soft');
  });

  it('AppButton: primary 기본, ghost·sm, 클릭 전달', async () => {
    const primary = mount(AppButton, { slots: { default: '확정' } });
    expect(primary.attributes('type')).toBe('button');
    expect(primary.classes()).toEqual(expect.arrayContaining(['bg-accent', 'w-full']));

    let clicked = 0;
    const ghost = mount(AppButton, { props: { variant: 'ghost', sm: true }, attrs: { onClick: () => clicked++ } });
    expect(ghost.classes()).toContain('border-line');
    expect(ghost.classes()).not.toContain('w-full');
    await ghost.trigger('click');
    expect(clicked).toBe(1);
  });

  it('AppButton: as=RouterLink면 링크로', () => {
    const w = mount(AppButton, { props: { as: RouterLinkStub }, attrs: { to: '/owner' } });
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/owner');
  });

  it('Banner: 색별 바탕', () => {
    const w = mount(Banner, { props: { tone: 'crit' }, slots: { default: '<b>보류</b> 이의 1건' } });
    expect(w.classes()).toContain('bg-crit-soft');
    expect(w.find('b').text()).toBe('보류');
    expect(mount(Banner).classes()).toContain('bg-surface-2');
  });

  it('SegmentedControl: 선택 표시 + update:modelValue', async () => {
    const w = mount(SegmentedControl, {
      props: {
        modelValue: 'tenant',
        options: [
          { value: 'tenant', label: '임차인' },
          { value: 'landlord', label: '임대인' },
          { value: 'hold', label: '보류', disabled: true },
        ],
      },
    });
    const buttons = w.findAll('button');
    expect(buttons[0].attributes('aria-pressed')).toBe('true');
    expect(buttons[2].attributes('disabled')).toBeDefined();
    await buttons[1].trigger('click');
    expect(w.emitted('update:modelValue')[0]).toEqual(['landlord']);
  });

  it('AppBar: 제목·메타, 뒤로 버튼은 back일 때만 + 이벤트', async () => {
    const w = mount(AppBar, { props: { title: '리포트 상세', meta: '최임차 · 임차인', back: true } });
    expect(w.find('h1').text()).toBe('리포트 상세');
    expect(w.text()).toContain('최임차 · 임차인');
    await w.find('button[aria-label="뒤로"]').trigger('click');
    expect(w.emitted('back')).toHaveLength(1);
    expect(mount(AppBar, { props: { title: 'x' } }).find('button').exists()).toBe(false);
  });

  it('BottomTabBar: 탭마다 링크 + 활성 탭 표시', () => {
    const w = mount(BottomTabBar, {
      ...stubs,
      props: {
        items: [
          { label: '홈', to: '/owner', icon: 'home', active: true },
          { label: '리포트', to: '/owner/reports', icon: 'report', active: false },
          { label: '수선비 장부', to: '/owner/repair-ledger', icon: 'ledger', active: false },
        ],
      },
    });
    const links = w.findAllComponents(RouterLinkStub);
    expect(links.map((l) => l.props('to'))).toEqual(['/owner', '/owner/reports', '/owner/repair-ledger']);
    expect(links[0].attributes('aria-current')).toBe('page');
    expect(links[0].classes()).toContain('text-accent');
    expect(links[1].attributes('aria-current')).toBeUndefined();
    expect(w.findAll('svg')).toHaveLength(3);
  });
});

describe('창 22 추가', () => {
  it('AppButton seal · SegmentedControl 옵션 test → data-test', () => {
    expect(mount(AppButton, { props: { variant: 'seal', sm: true } }).classes()).toContain('bg-seal');
    const w = mount(SegmentedControl, {
      props: { modelValue: 'agree', options: [{ value: 'agree', label: '동의', test: 'choose-agree' }] },
    });
    expect(w.find('[data-test="choose-agree"]').exists()).toBe(true);
  });

  it('IntegrityBadge: 정상은 seal 박스 + mono 해시(문구 그대로), 변경 감지는 crit 박스', () => {
    const hash = 'ab12' + '0'.repeat(56) + 'cd34';
    const ok = mount(IntegrityBadge, { props: { verify: { ok: true, storedHash: hash, currentHash: hash } } });
    expect(ok.text()).toBe('발행 동결 · SHA-256 ab12…cd34 · 발행 이후 변경 없음');
    expect(ok.classes()).toContain('border-seal');
    expect(ok.find('.num').text()).toBe('SHA-256 ab12…cd34');
    const bad = mount(IntegrityBadge, { props: { verify: { ok: false, storedHash: hash, currentHash: 'ff' } } });
    expect(bad.text()).toBe('변경 감지 · 기록된 해시와 다름');
    expect(bad.classes()).toContain('border-crit');
    expect(mount(IntegrityBadge, { props: { verify: null } }).find('p').exists()).toBe(false);
  });
});

describe('창 23 추가', () => {
  it('Chip: 선택이면 accent + aria-pressed, 클릭 전달', async () => {
    const off = mount(Chip, { slots: { default: '정기 점검' } });
    expect(off.attributes('aria-pressed')).toBe('false');
    expect(off.classes()).toContain('border-line');
    const on = mount(Chip, { props: { pressed: true }, slots: { default: '정기 점검' } });
    expect(on.attributes('aria-pressed')).toBe('true');
    expect(on.classes()).toContain('bg-accent-soft');
    await on.trigger('click');
    expect(on.emitted('click')).toHaveLength(1);
  });
});
