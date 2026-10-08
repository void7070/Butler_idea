import { describe, it, expect, beforeEach } from 'vitest';
import { session, setUser, clearUser, isLoggedIn, homePathForRole } from '../src/stores/session.js';

beforeEach(() => {
  localStorage.clear();
  clearUser();
});

describe('session store', () => {
  it('setUser는 상태와 localStorage에 보존', () => {
    setUser({ id: 7, name: '이시공', role: 'contractor' });
    expect(session.userId).toBe('7');
    expect(session.role).toBe('contractor');
    expect(localStorage.getItem('selectedUserId')).toBe('7');
    expect(localStorage.getItem('selectedRole')).toBe('contractor');
    expect(isLoggedIn()).toBe(true);
  });

  it('clearUser는 상태와 localStorage를 비운다', () => {
    setUser({ id: 7, name: '이시공', role: 'contractor' });
    clearUser();
    expect(session.userId).toBeNull();
    expect(localStorage.getItem('selectedUserId')).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });

  it('homePathForRole 역할별 경로', () => {
    expect(homePathForRole('contractor')).toBe('/contractor');
    expect(homePathForRole('owner')).toBe('/owner');
    expect(homePathForRole('tenant')).toBe('/tenant/reports');
  });
});
