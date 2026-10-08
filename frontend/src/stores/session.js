import { reactive, readonly } from 'vue';

/**
 * 데모 세션 상태(로그인 없음). selectedUserId/selectedRole을 localStorage에 보존해
 * 새로고침해도 유지한다. api.js는 selectedUserId를 x-user-id 헤더로 보낸다.
 */
const KEY_ID = 'selectedUserId';
const KEY_ROLE = 'selectedRole';
const KEY_NAME = 'selectedUserName';

const state = reactive({
  userId: localStorage.getItem(KEY_ID) || null,
  role: localStorage.getItem(KEY_ROLE) || null,
  name: localStorage.getItem(KEY_NAME) || null,
});

export function setUser(user) {
  state.userId = String(user.id);
  state.role = user.role;
  state.name = user.name;
  localStorage.setItem(KEY_ID, state.userId);
  localStorage.setItem(KEY_ROLE, state.role);
  localStorage.setItem(KEY_NAME, state.name);
}

export function clearUser() {
  state.userId = null;
  state.role = null;
  state.name = null;
  localStorage.removeItem(KEY_ID);
  localStorage.removeItem(KEY_ROLE);
  localStorage.removeItem(KEY_NAME);
}

export function isLoggedIn() {
  return !!state.userId;
}

/** 역할별 기본 경로 */
export function homePathForRole(role) {
  if (role === 'contractor') return '/contractor';
  if (role === 'owner') return '/owner';
  if (role === 'tenant') return '/tenant/reports';
  return '/';
}

export const session = readonly(state);
