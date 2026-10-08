import { errors } from './errors.js';
import { getClauseTemplate } from '../domain/clauseTemplates.js';

/**
 * 계약 등록 입력 정규화·검증 (창 12). 순수 함수 — DB는 routes에서 따로 확인한다.
 *
 * 본문: { tenantUserId, deposit, monthlyRent, startDate, endDate, clauses: [{ templateCode, params? } | { text }] }
 * 결과: { tenantUserId, deposit, monthlyRent, startDate, endDate, clauses: [{ clauseNo, templateCode, params } | { clauseNo, text }] }
 * - clauseNo는 1부터 순서대로 매긴다.
 * - 템플릿 파라미터는 템플릿 defaultParams에 있는 이름만, 0 이상 정수만 받는다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLAUSE_TEXT = 500;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const isAmount = (v) => Number.isInteger(v) && v >= 0;

export function normalizeLeaseInput(body = {}) {
  const tenantUserId = Number(body.tenantUserId);
  if (!Number.isInteger(tenantUserId) || tenantUserId <= 0) {
    throw errors.badRequest('임차인을 선택해 주세요.', 'VALIDATION');
  }

  const deposit = Number(body.deposit);
  const monthlyRent = Number(body.monthlyRent);
  if (body.deposit == null || body.deposit === '' || !isAmount(deposit)) {
    throw errors.badRequest('보증금은 0 이상의 정수(원)여야 합니다.', 'INVALID_AMOUNT');
  }
  if (body.monthlyRent == null || body.monthlyRent === '' || !isAmount(monthlyRent)) {
    throw errors.badRequest('월세는 0 이상의 정수(원)여야 합니다.', 'INVALID_AMOUNT');
  }

  const { startDate, endDate } = body;
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw errors.badRequest('계약 기간은 YYYY-MM-DD 날짜로 입력해 주세요.', 'INVALID_PERIOD');
  }
  if (startDate >= endDate) {
    throw errors.badRequest('계약 종료일은 시작일보다 뒤여야 합니다.', 'INVALID_PERIOD');
  }

  if (body.clauses != null && !Array.isArray(body.clauses)) {
    throw errors.badRequest('특약 목록 형식이 올바르지 않습니다.', 'VALIDATION');
  }
  const clauses = (body.clauses ?? []).map((c, i) => normalizeClause(c, i + 1));

  return { tenantUserId, deposit, monthlyRent, startDate, endDate, clauses };
}

function normalizeClause(c, clauseNo) {
  if (c?.templateCode) {
    const template = getClauseTemplate(c.templateCode);
    if (!template) throw errors.badRequest(`알 수 없는 특약 템플릿입니다: ${c.templateCode}`, 'UNKNOWN_TEMPLATE');
    const params = {};
    for (const [key, raw] of Object.entries(c.params ?? {})) {
      if (!(key in template.defaultParams)) continue; // 모르는 파라미터는 버린다
      const value = Number(raw);
      if (raw === '' || raw == null || !isAmount(value)) {
        throw errors.badRequest(`특약 제${clauseNo}항(${template.title}) 값은 0 이상의 정수여야 합니다.`, 'INVALID_PARAM');
      }
      params[key] = value;
    }
    return { clauseNo, templateCode: template.code, params };
  }
  const text = typeof c?.text === 'string' ? c.text.trim() : '';
  if (!text) throw errors.badRequest(`특약 제${clauseNo}항 문장을 입력해 주세요.`, 'VALIDATION');
  if (text.length > MAX_CLAUSE_TEXT) {
    throw errors.badRequest(`특약 문장은 ${MAX_CLAUSE_TEXT}자 이내로 입력해 주세요.`, 'VALIDATION');
  }
  return { clauseNo, text };
}

/**
 * 두 계약 기간이 겹치는가. 기존 계약 종료일 = 새 계약 시작일(같은 날 인수인계)은 겹침으로 보지 않는다.
 * @param {{startDate:string,endDate:string}} a
 * @param {{startDate:string,endDate:string}} b
 */
export function periodsOverlap(a, b) {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}
