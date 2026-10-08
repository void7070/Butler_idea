import { describe, it, expect } from 'vitest';
import { buildInitialItems } from '../src/lib/wholeInspection.js';
import { SPACES } from '../src/domain/inspectionSpaces.js';

const totalItems = SPACES.reduce((n, s) => n + s.items.length, 0);

describe('buildInitialItems', () => {
  it('모든 공간×항목을 생성하고 기본 상태는 normal', () => {
    const items = buildInitialItems();
    expect(items).toHaveLength(totalItems); // 8공간 × 4 = 32
    expect(items.every((i) => i.state === 'normal')).toBe(true);
    expect(items[0]).toEqual({ category: '현관', name: '현관문', state: 'normal', location: '', description: '' });
  });

  it('기존 항목을 (공간,항목)으로 매칭해 덮어쓴다', () => {
    const items = buildInitialItems([
      { category: '거실', name: '창호', state: 'caution', location: '베란다측', description: '실리콘 들뜸' },
    ]);
    const target = items.find((i) => i.category === '거실' && i.name === '창호');
    expect(target.state).toBe('caution');
    expect(target.description).toBe('실리콘 들뜸');
    // 매칭 안 된 항목은 그대로 normal
    expect(items.find((i) => i.category === '현관' && i.name === '도어락').state).toBe('normal');
  });
});
