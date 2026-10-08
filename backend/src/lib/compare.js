/**
 * 리포트 비교 가능 판정 (순수 함수). 명세 §10 기준 + 창 4(입주 전↔퇴거).
 * - 같은 호실이어야 한다.
 * - 같은 점검 유형이어야 한다.
 * - 예외: 수리 전(repair_pre) ↔ 수리 후(repair_post) 조합은 허용한다.
 * - 예외: 입주 전(move_in) ↔ 퇴거 전/후(move_out_pre/move_out_post) 조합은 허용한다(isBaselinePair).
 *   이 조합은 lib/diff.js로 달라진 항목을 뽑는다.
 * 자동 분석/판단은 하지 않는다(여기서는 비교 가능 여부만 결정).
 */

const MOVE_OUT_TYPES = ['move_out_pre', 'move_out_post'];

function isRepairBeforeAfterPair(a, b) {
  const set = new Set([a, b]);
  return set.has('repair_pre') && set.has('repair_post');
}

/** 입주 전 ↔ 퇴거(전/후) 조합인가? 순서는 상관없다. */
export function isMoveInMoveOutPair(a, b) {
  return (a === 'move_in' && MOVE_OUT_TYPES.includes(b)) || (b === 'move_in' && MOVE_OUT_TYPES.includes(a));
}

/**
 * @param {{unit_id:number, type:string}} left
 * @param {{unit_id:number, type:string}} right
 * @returns {{ok:boolean, code:string, message?:string, sameType:boolean, isRepairBeforeAfter:boolean, isBaselinePair:boolean}}
 */
export function canCompare(left, right) {
  if (left.unit_id !== right.unit_id) {
    return {
      ok: false,
      code: 'UNIT_MISMATCH',
      message: '같은 호실의 리포트만 비교할 수 있습니다.',
      sameType: false,
      isRepairBeforeAfter: false,
      isBaselinePair: false,
    };
  }

  const sameType = left.type === right.type;
  const isRepairBeforeAfter = isRepairBeforeAfterPair(left.type, right.type);
  const isBaselinePair = isMoveInMoveOutPair(left.type, right.type);

  if (!sameType && !isRepairBeforeAfter && !isBaselinePair) {
    return {
      ok: false,
      code: 'TYPE_MISMATCH',
      message: '같은 점검 유형, 수리 전/후, 입주 전/퇴거 조합만 비교할 수 있습니다.',
      sameType,
      isRepairBeforeAfter,
      isBaselinePair,
    };
  }

  return { ok: true, code: 'OK', sameType, isRepairBeforeAfter, isBaselinePair };
}
