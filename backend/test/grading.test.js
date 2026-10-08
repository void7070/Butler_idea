import { describe, it, expect } from 'vitest';
import { computeWholeGrade, computeIssueGrade, computeGrade } from '../src/lib/grading.js';

const w = (...states) => states.map((s) => ({ state: s }));

describe('computeWholeGrade', () => {
  it('A: 모든 항목 정상', () => {
    expect(computeWholeGrade(w('normal', 'normal'))).toBe('A');
    expect(computeWholeGrade([])).toBe('A');
  });
  it('B: 주의 1~2, 수리 없음', () => {
    expect(computeWholeGrade(w('caution'))).toBe('B');
    expect(computeWholeGrade(w('caution', 'caution', 'normal'))).toBe('B');
  });
  it('C: 주의 3개 이상', () => {
    expect(computeWholeGrade(w('caution', 'caution', 'caution'))).toBe('C');
  });
  it('C: 수리 1개', () => {
    expect(computeWholeGrade(w('repair', 'normal'))).toBe('C');
  });
  it('D: 수리 2개 이상', () => {
    expect(computeWholeGrade(w('repair', 'repair'))).toBe('D');
  });
  it('E: 긴급(urgent)', () => {
    expect(computeWholeGrade(w('urgent', 'normal'))).toBe('E');
  });
  it('E: 소방·안전 분야 수리', () => {
    expect(computeWholeGrade([{ category: '소방·안전', state: 'repair' }])).toBe('E');
  });
});

describe('computeIssueGrade', () => {
  it('B: 경미한 기록(minor/기본)', () => {
    expect(computeIssueGrade([{ state: 'minor' }])).toBe('B');
    expect(computeIssueGrade([{ state: undefined }])).toBe('B');
  });
  it('C: 추가 확인 필요(check)', () => {
    expect(computeIssueGrade([{ state: 'minor' }, { state: 'check' }])).toBe('C');
  });
  it('D: 수리 필요(repair)', () => {
    expect(computeIssueGrade([{ state: 'check' }, { state: 'repair' }])).toBe('D');
  });
  it('E: 긴급(urgent)', () => {
    expect(computeIssueGrade([{ state: 'urgent' }])).toBe('E');
  });
  it('E: 소방·안전 수리', () => {
    expect(computeIssueGrade([{ category: '소방·안전', state: 'repair' }])).toBe('E');
  });
});

describe('computeGrade 디스패치', () => {
  it('flow=whole는 whole 규칙', () => {
    expect(computeGrade('whole', w('normal'))).toBe('A');
  });
  it('flow=issue는 issue 규칙(A 없음)', () => {
    expect(computeGrade('issue', w('minor'))).toBe('B');
  });
});
