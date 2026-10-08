import { buildClause } from '../domain/clauseTemplates.js';
import { getLeaseForDate } from '../repositories/leaseRepo.js';

export const PET_CLAUSE_NO = 5;

/**
 * 시연용: 1234호 정산이 쓰는 계약에 반려동물 특약(PET_DAMAGE)을 제5항으로 추가한다 (창 25, `npm run demo:pet`).
 * 시드는 바꾸지 않는다 — `npm run demo:reset`이면 사라진다. 이미 제5항이 있으면 그대로 둔다.
 * 계약은 정산과 같게 1234호 입주 리포트 날짜로 고른다(창 12). 임차인 확인 시각은 그 계약의 기존 특약과 같게
 * 넣어 "특약 미확인" 할 일이 새로 생기지 않게 한다.
 * @returns {{ status: 'added'|'exists'|'no_lease', unitName: string, leaseId: number|null }}
 */
export function addDemoPetClause(db, unitName = '1234호') {
  const unit = db.prepare('SELECT id FROM units WHERE name = ?').get(unitName);
  const moveIn = unit
    ? db.prepare("SELECT created_at FROM reports WHERE unit_id = ? AND type = 'move_in' ORDER BY created_at DESC, id DESC LIMIT 1").get(unit.id)
    : null;
  const lease = moveIn ? getLeaseForDate(db, unit.id, moveIn.created_at) : null;
  if (!lease) return { status: 'no_lease', unitName, leaseId: null };
  if (lease.clauses.some((c) => c.clauseNo === PET_CLAUSE_NO)) return { status: 'exists', unitName, leaseId: lease.id };

  const { text, rule } = buildClause('PET_DAMAGE');
  db.prepare(
    `INSERT INTO lease_clauses (lease_id, clause_no, template_code, text, rule_json, tenant_confirmed_at)
     VALUES (?, ?, 'PET_DAMAGE', ?, ?, ?)`
  ).run(lease.id, PET_CLAUSE_NO, text, JSON.stringify(rule), lease.tenantConfirmedAt ?? null);
  return { status: 'added', unitName, leaseId: lease.id };
}
