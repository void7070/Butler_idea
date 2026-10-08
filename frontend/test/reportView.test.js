import { describe, it, expect } from 'vitest';
import { gradeClass, stateLabel, stateTone, observationValueLabel, integrityBadge, shortHash } from '../src/lib/reportView.js';

describe('gradeClass', () => {
  it('등급별 클래스, 미지정은 plain', () => {
    expect(gradeClass('A')).toContain('text-ok');
    expect(gradeClass('E')).toContain('text-crit');
    expect(gradeClass('Z')).toContain('text-ink-2');
  });
});

describe('stateTone', () => {
  it('상태별 Pill 색, 미지정은 plain', () => {
    expect(stateTone('broken')).toBe('crit');
    expect(stateTone('caution')).toBe('warn');
    expect(stateTone('zzz')).toBe('plain');
  });
});

describe('stateLabel', () => {
  it('whole/issue 상태 라벨', () => {
    expect(stateLabel('caution')).toBe('주의');
    expect(stateLabel('repair')).toBe('수리 필요');
    expect(stateLabel('check')).toBe('추가 확인');
    expect(stateLabel('urgent')).toBe('긴급/안전');
  });
  it('미지정은 코드 그대로', () => {
    expect(stateLabel('zzz')).toBe('zzz');
  });
});

describe('observationValueLabel', () => {
  it('있음/없음/확인 필요', () => {
    expect(observationValueLabel('present')).toBe('있음');
    expect(observationValueLabel('absent')).toBe('없음');
    expect(observationValueLabel('uncertain')).toBe('확인 필요');
  });
});

describe('integrityBadge (창 9)', () => {
  const hash = 'ab12' + '0'.repeat(56) + 'cd34';
  it('ok면 발행 동결 + 해시 앞4…뒤4', () => {
    const b = integrityBadge({ ok: true, storedHash: hash, currentHash: hash });
    expect(b.ok).toBe(true);
    expect(b.text).toBe('발행 동결 · SHA-256 ab12…cd34 · 발행 이후 변경 없음');
    expect(b.class).toContain('border-seal');
  });
  it('ok=false면 빨간 변경 감지', () => {
    const b = integrityBadge({ ok: false, storedHash: hash, currentHash: 'ff' });
    expect(b.text).toBe('변경 감지 · 기록된 해시와 다름');
    expect(b.class).toContain('border-crit');
  });
  it('정산서(창 15)는 정산서 동결 · 확정 이후, 변경 감지 문구는 같다', () => {
    const b = integrityBadge({ ok: true, storedHash: hash, currentHash: hash }, 'settlement');
    expect(b.text).toBe('정산서 동결 · SHA-256 ab12…cd34 · 확정 이후 변경 없음');
    expect(integrityBadge({ ok: false, storedHash: hash, currentHash: 'ff' }, 'settlement').text).toBe(
      '변경 감지 · 기록된 해시와 다름'
    );
  });
  it('결과 없으면 null, shortHash', () => {
    expect(integrityBadge(null)).toBeNull();
    expect(shortHash(hash)).toBe('ab12…cd34');
  });
});
