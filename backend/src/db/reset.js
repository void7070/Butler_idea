import { applySchema } from './connection.js';
import { seed } from './seed.js';
import { serverNow } from '../config.js';

/**
 * 시연 DB 초기화 (창 17). 파일을 지우지 않고 같은 DB에서 스키마(DROP 후 CREATE) + seed를
 * 한 트랜잭션으로 다시 만든다 → 켜진 서버는 초기화 전 또는 후 상태만 본다(WAL).
 * @param {import('better-sqlite3').Database} db
 * @param {{ now?: Date }} [opts] 기준 시각 (생략 시 서버의 "지금" = DEMO_TODAY 기준일 + 실제 시각)
 * @returns {{ users: number, units: number, reports: number, inspections: number, settlements: number }}
 */
export function resetDemoDb(db, { now = serverNow() } = {}) {
  db.transaction(() => {
    applySchema(db);
    seed(db, { now });
  })();
  return countRows(db);
}

/** init·reset 출력용 건수 */
export function countRows(db) {
  const n = (table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  return {
    users: n('users'),
    buildings: n('buildings'),
    units: n('units'),
    reports: n('reports'),
    inspections: n('inspections'),
    settlements: n('settlements'),
  };
}
