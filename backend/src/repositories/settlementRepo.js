/**
 * 정산(보증금 공제 근거) 리포지토리. db를 첫 인자로 받아 테스트에서 in-memory DB를 주입한다.
 * 저장하는 것은 항목별 견적·부담자뿐이고, 금액·합계는 조회 때 lib/settlement.js로 계산한다.
 * 합의 확정된 정산은 확정 시점 계산 결과를 settlement_snapshots에 동결한다 (창 15).
 */
import { hashSnapshot, verifySnapshot } from '../lib/snapshotHash.js';

/** 같은 입주·퇴거 리포트 쌍의 정산이 있으면 그 행. */
export function findSettlementByPair(db, moveInReportId, moveOutReportId) {
  return db
    .prepare('SELECT * FROM settlements WHERE move_in_report_id = ? AND move_out_report_id = ? ORDER BY id DESC LIMIT 1')
    .get(moveInReportId, moveOutReportId);
}

/** 정산 생성 + 항목(item_code, 기본 부담자) 저장. @returns {number} settlementId */
export function createSettlement(db, { unitId, moveInReportId, moveOutReportId, items }) {
  const tx = db.transaction(() => {
    const id = db
      .prepare('INSERT INTO settlements (unit_id, move_in_report_id, move_out_report_id) VALUES (?, ?, ?)')
      .run(unitId, moveInReportId, moveOutReportId).lastInsertRowid;
    const ins = db.prepare('INSERT INTO settlement_items (settlement_id, item_code, estimate_cost, payer) VALUES (?, ?, ?, ?)');
    for (const it of items) ins.run(id, it.itemCode, it.estimateCost ?? null, it.payer);
    return id;
  });
  return tx();
}

export function getSettlementRow(db, id) {
  return db.prepare('SELECT * FROM settlements WHERE id = ?').get(id);
}

/** [{ itemCode, estimateCost, payer, payerSource, conditionClauseNo, tenantResponse, tenantResponseText, tenantResponseImage, tenantRespondedAt }] */
export function listSettlementItems(db, settlementId) {
  return db
    .prepare('SELECT * FROM settlement_items WHERE settlement_id = ? ORDER BY id')
    .all(settlementId)
    .map((r) => ({
      itemCode: r.item_code,
      estimateCost: r.estimate_cost,
      payer: r.payer,
      payerSource: r.payer_source, // null 기본 / 'bulk_small' / 'manual' (창 16)
      conditionClauseNo: r.condition_clause_no ?? null, // 임대인이 확인한 조건부 특약 항 번호 (창 25)
      tenantResponse: r.tenant_response,
      tenantResponseText: r.tenant_response_text,
      tenantResponseImage: r.tenant_response_image,
      tenantRespondedAt: r.tenant_responded_at,
    }));
}

/** 항목 1개 수정. patch에 있는 필드만 바꾼다. @returns {boolean} 항목이 있었는가 */
export function updateSettlementItem(db, settlementId, itemCode, patch) {
  const sets = [];
  const args = [];
  if ('payer' in patch) {
    sets.push('payer = ?');
    args.push(patch.payer);
  }
  if ('payerSource' in patch) {
    sets.push('payer_source = ?');
    args.push(patch.payerSource);
  }
  if ('estimateCost' in patch) {
    sets.push('estimate_cost = ?');
    args.push(patch.estimateCost);
  }
  if ('conditionClauseNo' in patch) {
    sets.push('condition_clause_no = ?');
    args.push(patch.conditionClauseNo);
  }
  if (sets.length === 0) {
    return !!db.prepare('SELECT 1 FROM settlement_items WHERE settlement_id = ? AND item_code = ?').get(settlementId, itemCode);
  }
  const info = db
    .prepare(`UPDATE settlement_items SET ${sets.join(', ')} WHERE settlement_id = ? AND item_code = ?`)
    .run(...args, settlementId, itemCode);
  return info.changes > 0;
}

/** 정산 상태 저장 (draft / hold). 확정은 confirmSettlement. */
export function setSettlementStatus(db, id, status) {
  db.prepare("UPDATE settlements SET status = ? WHERE id = ? AND status != 'confirmed'").run(status, id);
}

/** 확정 정산서 스냅샷 JSON + 그 SHA-256 저장 (창 15). 정산당 하나(UNIQUE). */
export function insertSettlementSnapshot(db, settlementId, snapshot) {
  const json = JSON.stringify(snapshot);
  db.prepare('INSERT INTO settlement_snapshots (settlement_id, snapshot_json, snapshot_hash) VALUES (?, ?, ?)').run(
    settlementId,
    json,
    hashSnapshot(json)
  );
}

/** 동결된 정산서(파싱한 JSON). 없으면 null. */
export function getSettlementSnapshot(db, settlementId) {
  const row = db.prepare('SELECT snapshot_json FROM settlement_snapshots WHERE settlement_id = ?').get(settlementId);
  return row ? JSON.parse(row.snapshot_json) : null;
}

/** 저장된 해시와 지금 snapshot_json의 해시 비교 → { storedHash, currentHash, ok, confirmedAt }. 스냅샷이 없으면 null. */
export function verifySettlementSnapshot(db, settlementId) {
  const row = db
    .prepare(
      `SELECT s.snapshot_json, s.snapshot_hash, t.confirmed_at
       FROM settlement_snapshots s JOIN settlements t ON t.id = s.settlement_id WHERE s.settlement_id = ?`
    )
    .get(settlementId);
  if (!row) return null;
  const { issuedAt, ...rest } = verifySnapshot({
    snapshotJson: row.snapshot_json,
    storedHash: row.snapshot_hash,
    issuedAt: row.confirmed_at,
  });
  return { ...rest, confirmedAt: issuedAt };
}

/** 합의 확정. */
export function confirmSettlement(db, id, confirmedAt) {
  db.prepare("UPDATE settlements SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(confirmedAt, id);
}

/**
 * 임차인 링크 응답 기록 (창 11). 항목당 한 번만 — 이미 응답이 있으면 바꾸지 않는다.
 * @returns {boolean} 기록했는가
 */
export function recordTenantResponse(db, settlementId, itemCode, { response, text, image, respondedAt }) {
  const info = db
    .prepare(
      `UPDATE settlement_items
         SET tenant_response = ?, tenant_response_text = ?, tenant_response_image = ?, tenant_responded_at = ?
       WHERE settlement_id = ? AND item_code = ? AND tenant_response IS NULL`
    )
    .run(response, text, image, respondedAt, settlementId, itemCode);
  return info.changes > 0;
}

// --- 정산 공유 링크 (창 11) ---

function mapShareLink(r) {
  return r
    ? {
        id: r.id,
        settlementId: r.settlement_id,
        token: r.token,
        createdBy: r.created_by,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        firstViewedAt: r.first_viewed_at,
      }
    : null;
}

export function createSettlementShareLink(db, { settlementId, token, createdBy, createdAt, expiresAt }) {
  db.prepare(
    'INSERT INTO settlement_share_links (settlement_id, token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(settlementId, token, createdBy, createdAt, expiresAt);
  return getSettlementShareLink(db, token);
}

export function getSettlementShareLink(db, token) {
  return mapShareLink(db.prepare('SELECT * FROM settlement_share_links WHERE token = ?').get(token));
}

/** 그 정산의 가장 최근 링크 (임대인 화면용). */
export function latestSettlementShareLink(db, settlementId) {
  return mapShareLink(
    db.prepare('SELECT * FROM settlement_share_links WHERE settlement_id = ? ORDER BY id DESC LIMIT 1').get(settlementId)
  );
}

/** 최초 열람 시각 기록 (이미 있으면 그대로). */
export function markShareLinkViewed(db, linkId, viewedAt) {
  db.prepare('UPDATE settlement_share_links SET first_viewed_at = ? WHERE id = ? AND first_viewed_at IS NULL').run(
    viewedAt,
    linkId
  );
}

/** 그 정산의 링크 전부, 만든 순서 (House Log, 창 18). */
export function listSettlementShareLinks(db, settlementId) {
  return db
    .prepare('SELECT * FROM settlement_share_links WHERE settlement_id = ? ORDER BY id')
    .all(settlementId)
    .map(mapShareLink);
}
