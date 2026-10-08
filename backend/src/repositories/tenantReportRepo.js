import { getItem } from '../domain/itemCatalog.js';

/**
 * 임차인 입주 제보 리포지토리 (창 10). db를 첫 인자로 받아 테스트에서 in-memory DB를 주입한다.
 */

function toTenantReport(r) {
  const item = getItem(r.item_code);
  return {
    id: r.id,
    reportId: r.report_id,
    itemCode: r.item_code,
    zone: item?.zone ?? null,
    name: item?.name ?? null,
    tier: item?.tier ?? null,
    state: r.state,
    text: r.text,
    imageBase64: r.image_base64,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

/** @returns {number} id */
export function createTenantReport(db, reportId, { itemCode, state, text, imageBase64 }, createdAt = null) {
  return db
    .prepare(
      `INSERT INTO tenant_reports (report_id, item_code, state, text, image_base64, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
    )
    .run(reportId, itemCode, state, text, imageBase64 ?? null, createdAt).lastInsertRowid;
}

export function getTenantReport(db, id) {
  const row = db.prepare('SELECT * FROM tenant_reports WHERE id = ?').get(id);
  return row ? toTenantReport(row) : null;
}

export function listTenantReports(db, reportId) {
  return db
    .prepare('SELECT * FROM tenant_reports WHERE report_id = ? ORDER BY id')
    .all(reportId)
    .map(toTenantReport);
}

/** pending → approved|rejected. @returns {boolean} 바뀌었는가 (이미 결정된 제보면 false) */
export function decideTenantReport(db, id, status, decidedAt = null) {
  const info = db
    .prepare(
      `UPDATE tenant_reports SET status = ?, decided_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND status = 'pending'`
    )
    .run(status, decidedAt, id);
  return info.changes > 0;
}

/** 리포트의 점검에 기록된 구역 확인 [{ zone, role }] */
export function listZoneConfirmations(db, inspectionId) {
  return db.prepare('SELECT zone, role, confirmed_at FROM zone_confirmations WHERE inspection_id = ? ORDER BY id').all(inspectionId);
}

/** 임차인 구역 확인 (중복은 멱등). */
export function confirmTenantZone(db, inspectionId, zone) {
  db.prepare("INSERT OR IGNORE INTO zone_confirmations (inspection_id, zone, role) VALUES (?, ?, 'tenant')").run(
    inspectionId,
    zone
  );
}

/** diff extras: 발행 뒤 포함한 임차인 구역 확인 + 제보 (compare·정산 공통). */
export function diffExtrasFor(db, moveInReportId) {
  const report = db.prepare('SELECT inspection_id FROM reports WHERE id = ?').get(moveInReportId);
  if (!report) return {};
  const tenantZones = db
    .prepare("SELECT zone FROM zone_confirmations WHERE inspection_id = ? AND role = 'tenant'")
    .all(report.inspection_id)
    .map((r) => r.zone);
  return { tenantZones, tenantReports: listTenantReports(db, moveInReportId) };
}
