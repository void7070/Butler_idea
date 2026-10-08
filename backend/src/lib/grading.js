/**
 * 등급 산출 (순수 함수). 명세 §7 기준.
 *
 * 점검 항목의 state(상태/심각도) 코드:
 *  - whole(전체 점검): 'normal' | 'caution' | 'repair' | 'urgent'
 *  - issue(문제 점검): 'minor' | 'check' | 'repair' | 'urgent'
 *  - baseline(입주·퇴거): 'normal' | 'minor' | 'damaged' | 'broken'
 * 'urgent'(긴급 조치 필요) 또는 소방·안전 분야의 수리/긴급은 E로 에스컬레이션.
 */

/** 소방·안전 관련 분야/공간 여부 */
function isFireSafety(category = '') {
  return /소방|안전/.test(category ?? '');
}

/**
 * 전체 점검 등급 (A~E).
 * A: 모든 항목 정상 / B: 주의 1~2, 수리 없음 / C: 주의 3+ 또는 수리 1
 * D: 수리 2+ / E: 소방·안전 수리 또는 긴급 조치 필요
 */
export function computeWholeGrade(items = []) {
  const cautionCount = items.filter((i) => i.state === 'caution').length;
  const repairCount = items.filter((i) => i.state === 'repair' || i.state === 'urgent').length;
  const hasUrgent = items.some((i) => i.state === 'urgent');
  const fireSafetyRepair = items.some(
    (i) => isFireSafety(i.category) && (i.state === 'repair' || i.state === 'urgent')
  );

  if (hasUrgent || fireSafetyRepair) return 'E';
  if (repairCount >= 2) return 'D';
  if (cautionCount >= 3 || repairCount >= 1) return 'C';
  if (cautionCount >= 1) return 'B';
  return 'A';
}

/**
 * 문제 항목 점검 등급 (B~E, A 없음 — 문제 점검은 정의상 기록할 문제가 있음).
 * B: 경미한 기록 / C: 추가 확인 필요 / D: 수리 필요 / E: 긴급 조치 또는 안전 위험
 */
export function computeIssueGrade(items = []) {
  const hasUrgent =
    items.some((i) => i.state === 'urgent') ||
    items.some((i) => isFireSafety(i.category) && (i.state === 'repair' || i.state === 'urgent'));

  if (hasUrgent) return 'E';
  if (items.some((i) => i.state === 'repair')) return 'D';
  if (items.some((i) => i.state === 'check')) return 'C';
  return 'B';
}

/**
 * 입주·퇴거 기준선 점검 등급 (A~E).
 * A: 이상 없음 / B: 경미만 / C: 손상 1~2 / D: 손상 3+ 또는 파손 1 / E: 파손 2+
 */
export function computeBaselineGrade(items = []) {
  const damaged = items.filter((i) => i.state === 'damaged').length;
  const broken = items.filter((i) => i.state === 'broken').length;
  const minor = items.filter((i) => i.state === 'minor').length;

  if (broken >= 2) return 'E';
  if (broken === 1 || damaged >= 3) return 'D';
  if (damaged >= 1) return 'C';
  if (minor >= 1) return 'B';
  return 'A';
}

/** flow(baseline/whole/issue)에 따라 등급을 산출한다. */
export function computeGrade(flow, items = []) {
  if (flow === 'baseline') return computeBaselineGrade(items);
  return flow === 'issue' ? computeIssueGrade(items) : computeWholeGrade(items);
}
