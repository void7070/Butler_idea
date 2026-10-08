// 리포트 표시용 순수 헬퍼.
import { GRADE_TONE } from './uiTones.js';

// 등급 색은 목업 .grade .g-A~E (창 23, uiTones.GRADE_TONE)
export function gradeClass(grade) {
  return GRADE_TONE[grade] ?? 'bg-surface-2 text-ink-2';
}

// whole(normal/caution/repair/urgent) + issue(minor/check/repair/urgent) + baseline(normal/minor/damaged/broken) 상태 라벨
const STATE_LABELS = {
  normal: '정상',
  caution: '주의',
  repair: '수리 필요',
  urgent: '긴급/안전',
  minor: '경미',
  check: '추가 확인',
  damaged: '손상',
  broken: '파손',
};

export function stateLabel(code) {
  return STATE_LABELS[code] ?? code ?? '';
}

// 상태 Pill 색 (창 23). baseline은 diffView.stateBadge와 같게(정상 ok · 경미 acc · 손상 warn · 파손 crit).
const STATE_TONES = {
  normal: 'ok',
  minor: 'acc',
  damaged: 'warn',
  broken: 'crit',
  caution: 'warn',
  check: 'warn',
  repair: 'crit',
  urgent: 'crit',
};

export function stateTone(code) {
  return STATE_TONES[code] ?? 'plain';
}

const OBSERVATION_LABELS = { present: '있음', absent: '없음', uncertain: '확인 필요' };

export function observationValueLabel(value) {
  return OBSERVATION_LABELS[value] ?? value ?? '';
}

/** SHA-256 hex → "앞4…뒤4". */
export function shortHash(hash) {
  if (!hash || hash.length < 8) return hash ?? '';
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

const INTEGRITY_LABELS = {
  report: { frozen: '발행 동결', since: '발행 이후' },
  settlement: { frozen: '정산서 동결', since: '확정 이후' }, // 확정 정산서 (창 15)
};

/**
 * 해시 검증 결과(GET /api/reports/:id/verify · /api/settlements/:id/verify) → 뱃지 (창 9·15).
 * 결과가 없으면 null(뱃지 숨김). ok면 초록 "발행 동결"/"정산서 동결", 아니면 빨간 "변경 감지".
 */
export function integrityBadge(verify, kind = 'report') {
  if (!verify) return null;
  const label = INTEGRITY_LABELS[kind] ?? INTEGRITY_LABELS.report;
  if (verify.ok) {
    return {
      ok: true,
      text: `${label.frozen} · SHA-256 ${shortHash(verify.storedHash)} · ${label.since} 변경 없음`,
      class: 'border-seal bg-seal-soft text-seal',
    };
  }
  return {
    ok: false,
    text: '변경 감지 · 기록된 해시와 다름',
    class: 'border-crit bg-crit-soft text-crit',
  };
}
