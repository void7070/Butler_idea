// 임차인 정산 링크 응답 · 정산 보류 화면용 순수 헬퍼. progress.md 창 11.
// 백엔드 응답을 그대로 쓰고, 여기서는 문구·버튼 상태만 정한다. 확정 가능 여부의 최종 판단은 백엔드가 한다.
import { formatWon, residualPercent } from './settlementView.js';
import { PILL_TONE } from './uiTones.js';

export const RESPONSE_OPTIONS = [
  { value: 'agree', label: '동의' },
  { value: 'object', label: '이의' },
];

/** 'YYYY-MM-DDTHH:mm:ss.sssZ' → '2026-09-26 18:00' (브라우저 현지 시각). 없으면 ''. */
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 임차인 응답 뱃지. */
export function responseBadge(response) {
  if (response === 'agree') return { label: '임차인 동의', tone: 'ok', class: PILL_TONE.ok };
  if (response === 'object') return { label: '임차인 이의', tone: 'crit', class: PILL_TONE.crit };
  return { label: '응답 대기', tone: 'plain', class: PILL_TONE.plain };
}

/** 임차인 부담이면서 이의가 있는 항목 (보류 원인). */
export function objectedItems(items = []) {
  return items.filter((it) => it.payer === 'tenant' && it.tenantResponse === 'object');
}

/** 임차인 부담 항목 중 응답이 없는 항목. */
export function waitingItems(items = []) {
  return items.filter((it) => it.payer === 'tenant' && !it.tenantResponse);
}

/**
 * 임대인 화면 "합의 확정" 버튼 상태 (백엔드 confirmCheck와 같은 순서).
 * @returns {{ enabled:boolean, reason:string }}
 */
export function confirmState(settlement) {
  if (!settlement) return { enabled: false, reason: '' };
  if (settlement.status === 'confirmed') return { enabled: false, reason: '이미 합의 확정된 정산입니다.' };
  const items = settlement.items ?? [];
  if (objectedItems(items).length) return { enabled: false, reason: '임차인 이의가 있어 확정할 수 없습니다.' };
  if (items.some((it) => it.payer === 'hold')) return { enabled: false, reason: '부담자가 "보류"인 항목을 먼저 정해 주세요.' };
  const waiting = waitingItems(items).length;
  if (waiting) return { enabled: false, reason: `임차인 응답을 기다리는 청구 항목이 ${waiting}개 있습니다.` };
  return { enabled: true, reason: '모든 청구 항목에 임차인이 동의했습니다.' };
}

/** 정산 상태 배너. draft는 배너 없음(null). */
export function statusBanner(settlement) {
  if (!settlement) return null;
  if (settlement.status === 'hold') {
    const n = objectedItems(settlement.items).length;
    return {
      tone: 'hold',
      title: `정산 보류 · 임차인 이의 ${n}건`,
      text: '이의가 있는 항목을 확인해 주세요. 임대인 부담으로 돌리거나 임차인과 협의한 뒤 확정할 수 있습니다.',
    };
  }
  if (settlement.status === 'confirmed') {
    return {
      tone: 'confirmed',
      title: '합의 확정',
      text: `${formatDateTime(settlement.confirmedAt)} 확정 · 더 이상 수정할 수 없습니다.`,
    };
  }
  return null;
}

/** 임대인 화면 링크 상태 문구. */
export function shareLinkStatus(link) {
  if (!link) return { expiryText: '', viewText: '' };
  return {
    expiryText: link.expired ? '링크 만료됨 · 새 링크를 만들어 주세요' : `${formatDateTime(link.expiresAt)}까지 유효`,
    viewText: link.firstViewedAt ? `임차인 최초 열람 ${formatDateTime(link.firstViewedAt)}` : '임차인이 아직 열어 보지 않았습니다',
  };
}

/** 공유 경로 → 전체 주소. */
export function shareUrl(path, origin = '') {
  return `${origin}${path ?? ''}`;
}

/**
 * 임차인 링크 화면 항목의 적용 기준.
 * @returns {{ basisText, clauseText, referenceText }}
 */
export function shareBasisView(item) {
  const b = item?.basis;
  if (!b) return { basisText: '', clauseText: '', referenceText: '' };
  if (b.type === 'clause' && b.kind === 'standard') {
    // 임대인이 조건 해당을 확인한 조건부 특약 (창 25) — 금액은 표준 기준
    const title = b.clause?.title ? ` (${b.clause.title})` : '';
    return {
      basisText: `적용 기준: 계약 특약 제${b.clauseNo}항${title} · 표준 기준 금액`,
      clauseText: b.clause?.text ?? '',
      referenceText: item.estimateCost == null ? '' : `견적 ${formatWon(item.estimateCost)} × 잔존 ${residualPercent(b.residual)}`,
    };
  }
  if (b.type === 'clause') {
    const title = b.clause?.title ? ` (${b.clause.title})` : '';
    return {
      basisText: `적용 기준: 계약 특약 제${b.clauseNo}항${title}`,
      clauseText: b.clause?.text ?? '',
      referenceText: `참고: 표준 기준 ${formatWon(b.stdAmount)}`,
    };
  }
  const years = item.lifespanYears ? `내구연수 ${item.lifespanYears}년 · ` : '';
  return {
    basisText: `적용 기준: 표준 기준 · ${years}잔존 ${residualPercent(b.residual)}`,
    clauseText: '',
    referenceText: item.estimateCost == null ? '' : `견적 ${formatWon(item.estimateCost)} × 잔존 ${residualPercent(b.residual)}`,
  };
}

/** 응답 입력 검증. 이의는 내용 필수. 오류 문구 또는 ''. */
export function responseFormError(draft) {
  if (!draft || !RESPONSE_OPTIONS.some((o) => o.value === draft.response)) return '동의 또는 이의를 선택하세요.';
  if (draft.response === 'object' && !String(draft.text ?? '').trim()) return '이의 내용을 입력하세요.';
  return '';
}

/** 응답 입력 → POST /api/share/settlement/:token/respond 본문. */
export function responsePayload(itemCode, draft) {
  const body = { itemCode, response: draft.response };
  const text = String(draft.text ?? '').trim();
  if (text) body.text = text;
  if (draft.response === 'object' && draft.image) body.image = draft.image;
  return body;
}

/** 임차인 링크 화면 진행 현황. */
export function responseProgress(items = []) {
  const agreed = items.filter((it) => it.response?.response === 'agree').length;
  const objected = items.filter((it) => it.response?.response === 'object').length;
  return { total: items.length, agreed, objected, waiting: items.length - agreed - objected };
}
