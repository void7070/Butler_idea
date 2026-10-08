/**
 * 시연 기준일 (창 17). backend/.env 의 DEMO_TODAY=YYYY-MM-DD 가 있으면
 * 서버의 "지금" = 그 날짜 + 실제 현재 시각(시·분·초). 없으면 실제 현재 시각.
 * 리허설과 발표 당일에 D-day·제보 기간·링크 만료가 같은 화면으로 나오게 한다.
 */

/**
 * DEMO_TODAY 값 검증. 비어 있으면 null, 형식이 틀리거나 없는 날짜면 throw.
 * @param {string|undefined} value
 * @returns {string|null} 'YYYY-MM-DD'
 */
export function parseDemoToday(value) {
  const v = (value ?? '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    throw new Error(`DEMO_TODAY는 YYYY-MM-DD 형식의 실제 날짜여야 합니다: "${v}"`);
  }
  return v;
}

/**
 * @param {string|null} demoToday 'YYYY-MM-DD' 또는 null
 * @param {Date} [real] 실제 현재 시각 (테스트 주입)
 * @returns {Date} 기준일이 있으면 기준일 + real의 현지 시각, 없으면 real
 */
export function demoNow(demoToday, real = new Date()) {
  if (!demoToday) return real;
  const [y, m, d] = demoToday.split('-').map(Number);
  return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
}

/**
 * 'YYYY-MM-DD HH:MM:SS' (서버 현지 시각). 기본값 대신 now를 넣을 때 쓴다.
 * 시간대 없는 시각은 모두 현지 시각으로 본다 — 시드의 '2024-03-02 10:00:00'과 같은 규칙.
 * (예전에는 UTC였으나 시드·화면과 9시간 어긋나 바꿨다.)
 */
export function sqlDateTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
