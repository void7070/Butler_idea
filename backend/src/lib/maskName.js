/**
 * 공유 링크 이름 가리기 (창 27). 비인증 공유 응답에만 쓴다.
 * 저장된 스냅샷 JSON·해시는 건드리지 않고, 응답 직전에 복사본만 바꾼다.
 */

/**
 * 1글자 그대로 · 2글자 "김*" · 3글자 "박*차" · 4글자 이상 첫·끝 글자만 남기고 가운데 *.
 * 빈 값·null·문자열이 아닌 값은 그대로.
 */
export function maskName(name) {
  if (typeof name !== 'string' || name === '') return name;
  const chars = Array.from(name);
  if (chars.length === 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

/** 리포트 스냅샷의 참여자(시공업자·임대인·임차인) 이름을 가린 복사본. 원본은 바꾸지 않는다. */
export function maskReportSnapshot(snapshot) {
  if (!snapshot?.parties) return snapshot;
  const parties = {};
  for (const [role, person] of Object.entries(snapshot.parties)) {
    parties[role] = person && typeof person === 'object' ? { ...person, name: maskName(person.name) } : person;
  }
  return { ...snapshot, parties };
}
