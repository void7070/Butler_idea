/** 사용자 조회 리포지토리. db를 인자로 받아 테스트에서 주입 가능하게 한다. */

/** 데모 사용자 목록. 시공업자 → 임대인 → 임차인 순으로 정렬. */
export function listUsers(db) {
  return db
    .prepare(
      `SELECT id, name, role, org FROM users
       ORDER BY CASE role WHEN 'contractor' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END, id`
    )
    .all();
}

/** id로 사용자 1명 조회. 없거나 잘못된 id면 null. */
export function getUserById(db, id) {
  if (!Number.isInteger(id)) return null;
  return db.prepare('SELECT id, name, role, org FROM users WHERE id = ?').get(id) ?? null;
}
