import { buildClause, clauseApplyMode, getClauseTemplate } from '../domain/clauseTemplates.js';

/**
 * 계약·특약 리포지토리. db를 첫 인자로 받아 테스트에서 in-memory DB를 주입한다.
 */

/**
 * 계약 1건 + 특약 저장.
 * clauses: [{ clauseNo, templateCode?, params?, text?, tenantConfirmedAt? }]
 * - templateCode가 있으면 text(생략 시 템플릿 문장)와 rule_json을 템플릿으로 만든다.
 * - 없으면 자유 문장: text 필수, rule_json NULL.
 */
export function createLease(db, lease, clauses = []) {
  const run = db.transaction(() => {
    const leaseId = db
      .prepare(
        `INSERT INTO leases (unit_id, owner_user_id, tenant_user_id, deposit, monthly_rent, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        lease.unitId,
        lease.ownerUserId,
        lease.tenantUserId,
        lease.deposit,
        lease.monthlyRent,
        lease.startDate,
        lease.endDate
      ).lastInsertRowid;

    const ins = db.prepare(
      `INSERT INTO lease_clauses (lease_id, clause_no, template_code, text, rule_json, tenant_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const c of clauses) {
      let text = c.text ?? null;
      let ruleJson = null;
      if (c.templateCode) {
        const built = buildClause(c.templateCode, c.params);
        text = text ?? built.text;
        ruleJson = JSON.stringify(built.rule);
      }
      if (!text) throw new Error(`특약 제${c.clauseNo}항 문장이 없습니다.`);
      ins.run(leaseId, c.clauseNo, c.templateCode ?? null, text, ruleJson, c.tenantConfirmedAt ?? null);
    }
    return leaseId;
  });
  return run();
}

/** 호실의 계약(가장 최근 1건) + 특약. 없으면 null. */
export function getLeaseByUnitId(db, unitId) {
  const row = db
    .prepare('SELECT * FROM leases WHERE unit_id = ? ORDER BY start_date DESC, id DESC LIMIT 1')
    .get(unitId);
  return row ? toLease(db, row) : null;
}

/** 계약 id로 조회. 없으면 null. */
export function getLeaseById(db, leaseId) {
  const row = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId);
  return row ? toLease(db, row) : null;
}

/**
 * 어떤 날짜(YYYY-MM-DD…)에 해당하는 호실 계약 (창 12).
 * 기간(start_date ~ end_date, 양 끝 포함)에 드는 계약 → 없으면 그 날짜 이전에 시작한 가장 최근 계약
 * → 그것도 없으면(계약 시작 전 입주 점검) 그 날짜 뒤에 시작하는 가장 이른 계약 → 없으면 null.
 * 정산·입주 제보 기간은 "호실의 최근 계약"이 아니라 입주 리포트 날짜로 계약을 고른다
 * (새 계약을 등록해도 옛 정산의 특약·보증금이 바뀌지 않게).
 */
export function getLeaseForDate(db, unitId, date) {
  const day = String(date).slice(0, 10);
  const row =
    db
      .prepare(
        `SELECT * FROM leases WHERE unit_id = ? AND start_date <= ? AND end_date >= ?
         ORDER BY start_date DESC, id DESC LIMIT 1`
      )
      .get(unitId, day, day) ??
    db
      .prepare('SELECT * FROM leases WHERE unit_id = ? AND start_date <= ? ORDER BY start_date DESC, id DESC LIMIT 1')
      .get(unitId, day) ??
    db
      .prepare('SELECT * FROM leases WHERE unit_id = ? AND start_date > ? ORDER BY start_date, id LIMIT 1')
      .get(unitId, day);
  return row ? toLease(db, row) : null;
}

/** 호실의 계약 이력 전체(최신 시작일 먼저). tenantUserId를 주면 그 임차인 계약만. */
export function listLeasesByUnitId(db, unitId, { tenantUserId = null } = {}) {
  const rows =
    tenantUserId == null
      ? db.prepare('SELECT * FROM leases WHERE unit_id = ? ORDER BY start_date DESC, id DESC').all(unitId)
      : db
          .prepare('SELECT * FROM leases WHERE unit_id = ? AND tenant_user_id = ? ORDER BY start_date DESC, id DESC')
          .all(unitId, tenantUserId);
  return rows.map((row) => toLease(db, row));
}

/** 임차인 특약 확인: 아직 확인하지 않은 특약에만 시각을 기록한다(이미 확인한 특약은 그대로). */
export function confirmLeaseClauses(db, leaseId, at) {
  db.prepare('UPDATE lease_clauses SET tenant_confirmed_at = ? WHERE lease_id = ? AND tenant_confirmed_at IS NULL').run(
    at,
    leaseId
  );
}

/** 임차인을 호실에 tenant로 연결 (이미 있으면 그대로). */
export function linkUnitTenant(db, unitId, tenantUserId) {
  db.prepare("INSERT OR IGNORE INTO unit_users (unit_id, user_id, role) VALUES (?, ?, 'tenant')").run(unitId, tenantUserId);
}

function toLease(db, row) {
  const clauses = db
    .prepare('SELECT * FROM lease_clauses WHERE lease_id = ? ORDER BY clause_no')
    .all(row.id)
    .map(toClause);
  const tenantName = db.prepare('SELECT name FROM users WHERE id = ?').get(row.tenant_user_id)?.name ?? null;
  const confirmed = clauses.every((c) => c.tenantConfirmedAt);

  return {
    id: row.id,
    unitId: row.unit_id,
    ownerUserId: row.owner_user_id,
    tenantUserId: row.tenant_user_id,
    tenantName,
    deposit: row.deposit,
    monthlyRent: row.monthly_rent,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    // 특약을 모두 확인했으면 가장 늦은 확인 시각, 아니면 null (특약이 없으면 확인할 것이 없어 true)
    tenantConfirmed: confirmed,
    tenantConfirmedAt: confirmed && clauses.length ? clauses.map((c) => c.tenantConfirmedAt).sort().at(-1) : null,
    clauses,
  };
}

function toClause(c) {
  const template = c.template_code ? getClauseTemplate(c.template_code) : null;
  return {
    id: c.id,
    clauseNo: c.clause_no,
    text: c.text,
    templateCode: c.template_code,
    templateTitle: template?.title ?? null,
    applyMode: clauseApplyMode(c.template_code), // 'auto' | 'display' | 'manual'
    rule: c.rule_json ? JSON.parse(c.rule_json) : null,
    tenantConfirmedAt: c.tenant_confirmed_at,
  };
}

/** 사용자가 그 호실의 owner/tenant로 연결되어 있는가? (contractor는 false) */
export function isUnitParty(db, unitId, user) {
  if (user.role !== 'owner' && user.role !== 'tenant') return false;
  const row = db
    .prepare('SELECT 1 FROM unit_users WHERE unit_id = ? AND user_id = ? AND role = ?')
    .get(unitId, user.id, user.role);
  return !!row;
}
