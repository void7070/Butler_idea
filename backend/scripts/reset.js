/**
 * 서버를 켠 채 시연 데이터 초기화 (창 17). `npm run demo:reset`
 *   - app.db 파일은 지우지 않고 같은 DB에 연결해 스키마(DROP 후 CREATE) + seed를 다시 넣는다(WAL이라 켜진 서버와 함께 동작).
 *   - 기준일은 backend/.env 의 DEMO_TODAY (없으면 오늘).
 *   - demo:tamper 백업(backend/.demo-tamper/)도 지운다 — 새 스냅샷과 맞지 않으므로.
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, serverNow } from '../src/config.js';
import { createDb } from '../src/db/connection.js';
import { resetDemoDb } from '../src/db/reset.js';
import { toDateString } from '../src/lib/tenantReport.js';

const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.demo-tamper');

const db = createDb(config.dbFile);
// 켜진 서버가 쓰는 중이면 잠깐 기다린다
db.pragma('busy_timeout = 5000');
const now = serverNow();
const counts = resetDemoDb(db, { now });
db.close();

if (existsSync(BACKUP_DIR)) rmSync(BACKUP_DIR, { recursive: true, force: true });

const basis = config.demoToday ? toDateString(now) : `${toDateString(now)}(실제 날짜)`;
console.log(`[demo:reset] 완료 · 기준일 ${basis} · reports ${counts.reports}`);
