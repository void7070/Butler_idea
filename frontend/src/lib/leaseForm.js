// 계약·특약 등록 화면(창 12) 순수 헬퍼. 백엔드 POST /api/units/:id/leases 본문을 만든다.
// 검증 결과는 화면 안내용이고, 최종 검증(기간 겹침·임차인 역할)은 백엔드가 한다. 특약 효력 판단은 하지 않는다.

export const APPLY_MODE_LABEL = {
  auto: '정산 자동 적용',
  display: '표시만',
  manual: '수동 확인 필요',
};

/** 특약 모드 Pill 색 (창 24, uiTones.PILL_TONE 키): 정산 자동 적용 acc · 표시만 plain · 수동 확인 필요 warn */
export const APPLY_MODE_TONE = {
  auto: 'acc',
  display: 'plain',
  manual: 'warn',
};

export const LEASE_NOTICES = [
  '템플릿 특약은 정산에 자동 적용되고, 직접 입력한 특약은 정산 때 "수동 확인 필요"로만 표시됩니다.',
  '특약 효력은 법률 검토가 필요할 수 있습니다.',
];

// 템플릿 파라미터 입력 칸 (clauseTemplates.js defaultParams 이름과 같다)
export const PARAM_FIELDS = {
  withinMonths: { label: '기간', unit: '개월' },
  amount: { label: '금액', unit: '원' },
  maxCount: { label: '허용 개수', unit: '개' },
};

export function emptyLeaseForm() {
  return { tenantUserId: '', deposit: '', monthlyRent: '', startDate: '', endDate: '', clauses: [] };
}

/** '30,000,000' / '30000000' / 30000000 → 30000000. 빈 값·숫자 아님 → null */
export function parseWon(value) {
  if (value == null) return null;
  const s = String(value).replace(/[,\s원]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  return Number(s);
}

/** 템플릿 칩 선택/해제. 같은 템플릿은 한 번만. 새 배열 반환. */
export function toggleTemplateClause(clauses, template) {
  if (clauses.some((c) => c.kind === 'template' && c.templateCode === template.code)) {
    return clauses.filter((c) => !(c.kind === 'template' && c.templateCode === template.code));
  }
  const params = Object.fromEntries(Object.entries(template.defaultParams ?? {}).map(([k, v]) => [k, String(v)]));
  return [...clauses, { kind: 'template', templateCode: template.code, params }];
}

export function isTemplateSelected(clauses, code) {
  return clauses.some((c) => c.kind === 'template' && c.templateCode === code);
}

export function addTextClause(clauses) {
  return [...clauses, { kind: 'text', text: '' }];
}

export function removeClause(clauses, index) {
  return clauses.filter((_, i) => i !== index);
}

/**
 * 템플릿 문구 미리보기: 기본 문구 속 기본값을 입력값으로 바꾼다 (예: 200,000원 → 150,000원).
 * 입력값이 올바르지 않으면 기본 문구 그대로.
 */
export function clausePreview(template, params = {}) {
  let text = template?.defaultText ?? '';
  for (const [key, def] of Object.entries(template?.defaultParams ?? {})) {
    const value = parseWon(params[key]);
    if (value == null || value < 0 || value === def) continue;
    text = text.replace(def.toLocaleString('ko-KR'), value.toLocaleString('ko-KR'));
  }
  return text;
}

/**
 * 입력 검증 → { tenantUserId?, deposit?, monthlyRent?, period?, clauses: { [index]: message } }.
 */
export function validateLeaseForm(form) {
  const errors = { clauses: {} };
  if (!form.tenantUserId) errors.tenantUserId = '임차인을 선택해 주세요.';

  const deposit = parseWon(form.deposit);
  if (deposit == null || deposit < 0) errors.deposit = '보증금을 0 이상의 숫자(원)로 입력해 주세요.';
  const rent = parseWon(form.monthlyRent);
  if (rent == null || rent < 0) errors.monthlyRent = '월세를 0 이상의 숫자(원)로 입력해 주세요.';

  if (!form.startDate || !form.endDate) errors.period = '계약 시작일과 종료일을 입력해 주세요.';
  else if (form.startDate >= form.endDate) errors.period = '계약 종료일은 시작일보다 뒤여야 합니다.';

  form.clauses.forEach((c, i) => {
    if (c.kind === 'text') {
      if (!c.text?.trim()) errors.clauses[i] = '특약 문장을 입력해 주세요.';
      return;
    }
    for (const raw of Object.values(c.params ?? {})) {
      const v = parseWon(raw);
      if (v == null || v < 0) errors.clauses[i] = '0 이상의 숫자를 입력해 주세요.';
    }
  });
  return errors;
}

export function hasFormErrors(errors) {
  return Object.keys(errors).some((k) => k !== 'clauses') || Object.keys(errors.clauses ?? {}).length > 0;
}

/** 폼 → POST /api/units/:id/leases 본문. 특약 번호는 백엔드가 순서대로 매긴다. */
export function buildLeasePayload(form) {
  return {
    tenantUserId: Number(form.tenantUserId),
    deposit: parseWon(form.deposit),
    monthlyRent: parseWon(form.monthlyRent),
    startDate: form.startDate,
    endDate: form.endDate,
    clauses: form.clauses.map((c) =>
      c.kind === 'text'
        ? { text: c.text.trim() }
        : {
            templateCode: c.templateCode,
            params: Object.fromEntries(Object.entries(c.params ?? {}).map(([k, v]) => [k, parseWon(v)])),
          }
    ),
  };
}

/** 임차인이 아직 확인하지 않은 계약 (특약이 하나라도 미확인). */
export function pendingLeases(leases) {
  return (leases ?? []).filter((l) => !l.tenantConfirmed);
}

/** 계약 카드 뱃지: 임차인 확인 여부. */
export function leaseConfirmBadge(lease) {
  if (!lease.clauses?.length) return { text: '특약 없음', tone: 'slate' };
  return lease.tenantConfirmed
    ? { text: '임차인 확인 완료', tone: 'green' }
    : { text: '임차인 확인 전', tone: 'amber' };
}

/** 확인 시각 표시 ('2024-02-20' 또는 ISO) → 'YYYY-MM-DD HH:mm' / 날짜만이면 그대로. */
export function formatConfirmedAt(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
