// 다음 입주 기준선 가져오기 (창 20) 폼 헬퍼 (순수 함수).
// 백엔드 GET /api/units/:id/baseline-carryover 응답
//   { sourceReportId, sourceDate, items: [{ itemCode, zone, name, tier, state, description, inSettlement,
//     settlementStatus, payer, suggestedState, needsRepairCheck, reason, moveOutImages }] }
// 을 baseline 폼 모델(lib/baselineInspection.js)에 채운다. 제안 상태 계산은 백엔드 lib/carryover.js.
//
// 폼 모델에 더하는 필드:
//   carryover: null | { sourceReportId, sourceDate, items: { [itemCode]: { reason, needsRepairCheck, repairCheckPending } } }
//   repairCheckPending = "수리 확인 필요" 노란(warn-soft) 표시가 남아 있음(작성자가 현장 확인 후 지운다).
// 구역 확인은 가져오지 않는다(새로 확인해야 한다).
import { setItemState, isAbnormal } from './baselineInspection.js';

export const REASON_REPAIR_CHECK = '퇴거 정산 항목 · 수리 확인 필요';

/** 이전 퇴거 기록 가져오기는 입주 전 점검에서만. */
export function canCarryOver(inspection) {
  return inspection?.type === 'move_in';
}

/**
 * 가져온 제안 상태를 폼에 채운다. 가져온 항목만 바꾸고, 다른 항목·구역 확인은 그대로 둔다.
 * 이상으로 채운 항목은 setItemState 규칙대로 그 구역 확인이 풀린다. 퇴거 메모는 메모 칸으로 가져온다.
 */
export function applyCarryover(model, catalog, source) {
  let next = { ...model };
  const items = {};
  for (const it of source?.items ?? []) {
    if (!next.entries?.[it.itemCode]) continue; // 카탈로그에 없는 코드
    next = setItemState(next, catalog, it.itemCode, it.suggestedState);
    const description = isAbnormal(it.suggestedState) ? it.description ?? '' : '';
    next.entries = { ...next.entries, [it.itemCode]: { state: it.suggestedState, description } };
    items[it.itemCode] = {
      reason: it.reason,
      needsRepairCheck: !!it.needsRepairCheck,
      repairCheckPending: !!it.needsRepairCheck,
    };
  }
  return {
    ...next,
    carryover: { sourceReportId: source.sourceReportId, sourceDate: source.sourceDate ?? null, items },
  };
}

/** 저장된 inspection.carryover → 폼 모델 carryover. */
export function fromSavedCarryover(saved) {
  if (!saved?.sourceReportId) return null;
  const items = {};
  for (const it of saved.items ?? []) {
    items[it.itemCode] = {
      reason: it.reason,
      needsRepairCheck: it.reason === REASON_REPAIR_CHECK,
      repairCheckPending: !!it.repairCheckPending,
    };
  }
  return { sourceReportId: saved.sourceReportId, sourceDate: saved.sourceDate ?? null, items };
}

/** 현장에서 수리를 확인하고 노란 표시를 지운다. */
export function clearRepairCheck(model, code) {
  const entry = model.carryover?.items?.[code];
  if (!entry?.repairCheckPending) return model;
  return {
    ...model,
    carryover: { ...model.carryover, items: { ...model.carryover.items, [code]: { ...entry, repairCheckPending: false } } },
  };
}

/**
 * 항목 상태를 바꿨을 때: 수리 확인 항목을 이상으로 바꾸면 작성자가 현장에서 본 것이므로 표시를 지운다.
 * 정상 그대로 두는 것은 "확인 완료" 버튼으로만 지운다.
 */
export function afterStateChange(model, code, state) {
  return isAbnormal(state) ? clearRepairCheck(model, code) : model;
}

/** 폼에서 항목 옆에 보일 표시. 가져온 항목이 아니면 null. */
export function carryoverBadge(model, code) {
  const entry = model.carryover?.items?.[code];
  if (!entry) return null;
  return {
    label: '이전 기록',
    reason: entry.reason,
    pending: entry.repairCheckPending,
    class: entry.repairCheckPending ? 'bg-warn-soft text-warn' : 'bg-seal-soft text-seal',
  };
}

/** 확인 표시가 남은 항목 (카탈로그 순). */
export function pendingRepairChecks(model, catalog) {
  const items = model.carryover?.items ?? {};
  return catalog.items.filter((it) => items[it.code]?.repairCheckPending);
}

/** 요약 줄: "이전 기록에서 n개 가져옴 · 수리 확인 n개". 가져온 적 없으면 null. */
export function carryoverSummary(model, catalog) {
  if (!model.carryover) return null;
  const entries = Object.values(model.carryover.items ?? {});
  const repairTotal = entries.filter((e) => e.needsRepairCheck).length;
  const pending = pendingRepairChecks(model, catalog).length;
  let text = `이전 기록에서 ${entries.length}개 가져옴`;
  if (repairTotal) text += pending ? ` · 수리 확인 ${pending}개` : ' · 수리 확인 모두 완료';
  return { text, count: entries.length, repairTotal, pending };
}

/** 제출 전 안내 문구(막지 않는다). 확인 표시가 없으면 null. */
export function submitWarning(model, catalog) {
  const pending = pendingRepairChecks(model, catalog);
  if (!pending.length) return null;
  const names = pending.map((it) => `${it.zone} ${it.name}`).join(', ');
  return `수리 확인이 끝나지 않은 항목이 ${pending.length}개 있습니다: ${names}\n현장에서 수리 여부를 확인하고 표시를 지워 주세요. 그래도 제출할까요?`;
}

/** PATCH 본문에 붙일 carryover. 가져온 적 없으면 빈 객체(기존 값을 건드리지 않음). */
export function carryoverPayload(model) {
  if (!model.carryover) return {};
  return {
    carryover: {
      sourceReportId: model.carryover.sourceReportId,
      items: Object.entries(model.carryover.items).map(([itemCode, e]) => ({
        itemCode,
        reason: e.reason,
        repairCheckPending: !!e.repairCheckPending,
      })),
    },
  };
}

/** 퇴거 사진 작은 미리보기: 가져오기 응답(source)의 그 항목 사진. */
export function previewImages(source, code) {
  return source?.items?.find((it) => it.itemCode === code)?.moveOutImages ?? [];
}
