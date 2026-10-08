// 수선비 장부 화면 표시용 순수 헬퍼. progress.md 창 16.
// 백엔드 GET /api/owner/repair-ledger 응답을 그대로 쓴다. 합계·사유 판단은 백엔드(lib/repairLedger.js)가 한다.
// 세금 계산·필요경비 판단은 하지 않는다.
import { PILL_TONE } from './uiTones.js';

export const TAX_NOTICE = '필요경비 인정 여부는 세무사 확인이 필요합니다';
export const PENDING_NOTICE = '합의 확정 전 정산의 임대인 부담 항목입니다. 확정되면 장부에 들어가며, 합계에는 넣지 않습니다.';

const REASON_CLASS = {
  '자연 마모 후보': PILL_TONE.ok,
  '소액 일괄': PILL_TONE.seal,
  '이의 후 임대인 부담': PILL_TONE.warn,
  '임대인 선택': PILL_TONE.plain,
};

/** 사유 뱃지 색 */
export function reasonClass(reason) {
  return REASON_CLASS[reason] ?? REASON_CLASS['임대인 선택'];
}

/** { year, unitId } → '?year=2026&unitId=1' (빈 값은 뺀다, 없으면 '') */
export function ledgerQuery({ year, unitId } = {}) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (unitId) params.set('unitId', String(unitId));
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** 내려받을 CSV 파일 이름: 수선비장부[_2026][_1234호].csv */
export function csvFilename({ year, unitId } = {}, units = []) {
  const unitName = unitId ? units.find((u) => u.id === Number(unitId))?.name : null;
  return ['수선비장부', year, unitName].filter(Boolean).join('_') + '.csv';
}

/** 예정 항목의 정산 상태 문구 */
export function pendingStatusLabel(status) {
  return status === 'hold' ? '정산 보류' : '합의 전';
}

/** 필터 설명 (표 제목 옆) */
export function filterLabel({ year, unitId } = {}, units = []) {
  const unitName = unitId ? units.find((u) => u.id === Number(unitId))?.name : null;
  return [year ? `${year}년` : '전체 연도', unitName ?? '전체 호실'].join(' · ');
}

/** 해시 검증 실패 행이 있는가 (변조된 확정 정산서) */
export function hasTampered(rows = []) {
  return rows.some((r) => r.hashOk === false);
}
