import { SPACES } from '../domain/inspectionSpaces.js';

/**
 * 전체 점검 폼의 초기 항목 배열을 만든다.
 * SPACES 정의대로 모든 공간×항목을 생성하고, 기존 점검의 items가 있으면
 * (category, name)으로 매칭해 상태/위치/설명을 덮어쓴다.
 * → 저장 후 다시 열어도 입력값이 유지된다.
 */
export function buildInitialItems(existingItems = []) {
  const key = (c, n) => `${c}::${n}`;
  const existing = new Map((existingItems ?? []).map((it) => [key(it.category, it.name), it]));

  const out = [];
  for (const { space, items } of SPACES) {
    for (const name of items) {
      const ex = existing.get(key(space, name));
      out.push({
        category: space,
        name,
        state: ex?.state ?? 'normal',
        location: ex?.location ?? '',
        description: ex?.description ?? '',
      });
    }
  }
  return out;
}
