// 점검 유형 (백엔드 domain/inspectionTypes.js와 동일한 코드/플로우).

export const INSPECTION_TYPES = [
  { code: 'move_in', label: '입주 전 점검', flow: 'baseline' },
  { code: 'periodic', label: '정기 점검', flow: 'whole' },
  { code: 'move_out_pre', label: '퇴거 전 점검', flow: 'baseline' },
  { code: 'move_out_post', label: '퇴거 후 점검', flow: 'baseline' },
  { code: 'emergency', label: '긴급 점검', flow: 'issue' },
  { code: 'repair_pre', label: '수리 전 점검', flow: 'issue' },
  { code: 'repair_post', label: '수리 후 점검', flow: 'issue' },
];

export function labelForType(code) {
  return INSPECTION_TYPES.find((t) => t.code === code)?.label ?? code;
}
