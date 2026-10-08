// 전체 점검(whole) 공간/항목 정의. 프론트엔드_PRD §7 확정 공간 기준.

export const WHOLE_STATES = [
  { code: 'normal', label: '정상' },
  { code: 'caution', label: '주의' },
  { code: 'repair', label: '수리 필요' },
];

export const SPACES = [
  { space: '현관', items: ['현관문', '도어락', '문틀', '신발장'] },
  { space: '거실', items: ['벽지', '바닥', '창호', '콘센트'] },
  { space: '주방', items: ['싱크대', '수전', '배수', '후드'] },
  { space: '방1', items: ['벽지', '바닥', '창호', '콘센트'] },
  { space: '방2', items: ['벽지', '바닥', '창호', '콘센트'] },
  { space: '화장실', items: ['세면대', '변기', '수전', '배수'] },
  { space: '베란다', items: ['창호', '바닥', '배수', '누수 흔적'] },
  { space: '보일러룸', items: ['보일러', '배관', '밸브', '누수 흔적'] },
];
