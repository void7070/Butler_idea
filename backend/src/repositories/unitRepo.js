/**
 * 호실 조회 리포지토리. db를 인자로 받아 테스트에서 in-memory DB를 주입할 수 있게 한다.
 */

/**
 * 사용자가 접근 가능한 호실 목록.
 * - contractor: 현장 점검 주체이므로 전체 호실
 * - owner/tenant: unit_users로 연결된 본인 호실만
 * (권한의 최종 판단은 백엔드가 DB 기준으로 한다 — B03에서 API로 노출)
 */
export function getAccessibleUnits(db, userId) {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) return [];

  if (user.role === 'contractor') {
    return db
      .prepare(
        `SELECT u.id, u.name, u.building_id, b.name AS building_name
         FROM units u JOIN buildings b ON b.id = u.building_id
         ORDER BY u.id`
      )
      .all();
  }

  return db
    .prepare(
      `SELECT u.id, u.name, u.building_id, b.name AS building_name
       FROM units u
       JOIN buildings b ON b.id = u.building_id
       JOIN unit_users uu ON uu.unit_id = u.id
       WHERE uu.user_id = ? AND uu.role = ?
       ORDER BY u.id`
    )
    .all(userId, user.role);
}
