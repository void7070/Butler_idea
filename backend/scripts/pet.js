/**
 * 시연 선택 장면 (창 25). `npm run demo:pet`
 *   1234호 계약에 반려동물 특약(PET_DAMAGE)을 제5항으로 추가한다. 이미 있으면 그대로.
 *   시드는 바꾸지 않는다 → `npm run demo:reset`이면 사라진다.
 */
import { config } from '../src/config.js';
import { createDb } from '../src/db/connection.js';
import { addDemoPetClause, PET_CLAUSE_NO } from '../src/db/demoPet.js';

const db = createDb(config.dbFile);
db.pragma('busy_timeout = 5000');
const r = addDemoPetClause(db);
db.close();

const MESSAGES = {
  added: `${r.unitName} 계약 #${r.leaseId}에 특약 제${PET_CLAUSE_NO}항(반려동물 손상) 추가 · 되돌리기: npm run demo:reset`,
  exists: `${r.unitName} 계약 #${r.leaseId}에 특약 제${PET_CLAUSE_NO}항이 이미 있어 그대로 둡니다`,
  no_lease: `${r.unitName} 입주 리포트·계약을 찾지 못했습니다. npm run demo:reset 후 다시 실행하세요`,
};
console.log(`[demo:pet] ${MESSAGES[r.status]}`);
if (r.status === 'no_lease') process.exitCode = 1;
