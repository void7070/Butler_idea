// 문제 항목 점검(issue) 분야/항목 정의. 프론트엔드_PRD §8 기준.

export const ISSUE_FIELDS = [
  { field: '인테리어·마감', items: ['벽지 찢어짐', '벽지 오염', '바닥 찍힘', '몰딩 파손', '타일 균열'] },
  { field: '샷시·창호', items: ['방충망 찢어짐', '창문 작동 불량', '유리 파손', '실리콘 들뜸', '잠금장치 불량'] },
  { field: '설비·배관', items: ['누수', '배수 불량', '수전 흔들림', '보일러 이상', '배관 부식'] },
  { field: '전기', items: ['콘센트 불량', '조명 미작동', '스위치 불량', '차단기 이상', '배선 노출'] },
  { field: '소방·안전', items: ['감지기 미작동', '소화기 미비', '가스누설 의심', '비상등 불량', '안전 위험 요소'] },
];

// 심각도(state). 백엔드 grading의 issue 코드(minor/check/repair/urgent)와 일치.
export const ISSUE_SEVERITIES = [
  { code: 'minor', label: '경미' },
  { code: 'check', label: '추가 확인' },
  { code: 'repair', label: '수리 필요' },
  { code: 'urgent', label: '긴급/안전' },
];

// 현장 확인 항목 값
export const OBSERVATION_VALUES = [
  { code: 'present', label: '있음' },
  { code: 'absent', label: '없음' },
  { code: 'uncertain', label: '확인 필요' },
];

export function itemsForField(field) {
  return ISSUE_FIELDS.find((f) => f.field === field)?.items ?? [];
}
