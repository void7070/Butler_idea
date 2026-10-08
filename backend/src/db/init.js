import { existsSync, rmSync } from 'node:fs';
import { config, serverNow } from '../config.js';
import { createDb } from './connection.js';
import { resetDemoDb } from './reset.js';
import { toDateString } from '../lib/tenantReport.js';

/**
 * DB 초기화 스크립트. `npm run db:init`로 실행한다.
 * 기존 파일을 지우고 스키마 + seed를 새로 만든다. (WAL 부속 파일까지 정리)
 * 서버가 켜져 있으면 파일이 잠겨 실패할 수 있다 → 그때는 `npm run demo:reset`(창 17).
 * 기준 날짜는 DEMO_TODAY(.env, 없으면 오늘).
 */
for (const suffix of ['', '-wal', '-shm']) {
  const f = config.dbFile + suffix;
  if (existsSync(f)) rmSync(f);
}

const db = createDb(config.dbFile);
const now = serverNow();
const counts = resetDemoDb(db, { now });
db.close();

console.log(`[db:init] ${config.dbFile} 생성 완료 · 기준일 ${toDateString(now)}${config.demoToday ? ' (DEMO_TODAY)' : ''}`);
console.log('[db:init] counts:', counts);
