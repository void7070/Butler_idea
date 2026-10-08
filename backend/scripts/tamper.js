/**
 * 발표 시연용 변조 스크립트 (창 9). API를 거치지 않고 DB의 스냅샷 JSON을 직접 고친다.
 *
 *   npm run demo:tamper -- <reportId>   화장실 실리콘(BATHROOM_SILICONE) 상태를 바꾼다 → 리포트 뱃지 "변경 감지"
 *   npm run demo:restore -- <reportId>  변조 전 JSON으로 되돌린다 → "발행 이후 변경 없음"
 *
 *   npm run demo:tamper-settlement -- <settlementId>   확정 정산서 스냅샷의 임차인 청구 합계를 바꾼다 (창 15)
 *   npm run demo:restore-settlement -- <settlementId>  변조 전 JSON으로 되돌린다 → "확정 이후 변경 없음"
 *
 * 되돌리기용으로 원본 snapshot_json을 backend/.demo-tamper/report-<id>.json · settlement-<id>.json에 그대로 보관한다.
 * snapshot_hash는 건드리지 않는다(변조를 감지하게 하는 것이 목적).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { createDb } from '../src/db/connection.js';

const SILICONE = 'BATHROOM_SILICONE';
// 한 단계 가볍게 (파손→손상→경미, 경미는 손상으로)
const TAMPERED_STATE = { broken: 'damaged', damaged: 'minor', minor: 'damaged' };
// 정산서 변조: 임차인 청구 합계를 이만큼 줄인다
const SETTLEMENT_TAMPER_DELTA = 100000;
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.demo-tamper');

function fail(message) {
  console.error(`[demo] ${message}`);
  process.exit(1);
}

const TARGETS = {
  report: {
    label: '리포트',
    table: 'report_snapshots',
    key: 'report_id',
    usage: 'npm run demo:tamper -- <reportId>  /  npm run demo:restore -- <reportId>',
    missing: (id) => `리포트 ${id}의 스냅샷이 없습니다.`,
    // 화장실 실리콘 상태를 한 단계 바꾼다
    tamper(snapshot, id) {
      const item = (snapshot.items ?? []).find((it) => it.item_code === SILICONE);
      if (!item) fail(`리포트 ${id}에 화장실 실리콘 기록이 없습니다. 퇴거 리포트 id를 넣으세요.`);
      const before = item.state;
      item.state = TAMPERED_STATE[before] ?? 'minor';
      return `화장실 실리콘 ${before} → ${item.state}`;
    },
  },
  settlement: {
    label: '정산',
    table: 'settlement_snapshots',
    key: 'settlement_id',
    usage: 'npm run demo:tamper-settlement -- <settlementId>  /  npm run demo:restore-settlement -- <settlementId>',
    missing: (id) => `정산 ${id}의 확정 스냅샷이 없습니다. 먼저 화면에서 "합의 확정"을 하세요.`,
    // 임차인 청구 합계만 바꾼다 (항목 금액·반환 예정액은 그대로 → 해시가 달라져 "변경 감지")
    tamper(snapshot) {
      const before = snapshot.totals.tenantTotal;
      snapshot.totals.tenantTotal = Math.max(0, before - SETTLEMENT_TAMPER_DELTA);
      return `임차인 청구 합계 ${before.toLocaleString('ko-KR')}원 → ${snapshot.totals.tenantTotal.toLocaleString('ko-KR')}원`;
    },
  },
};

const [command, rawId] = process.argv.slice(2);
const [mode, kind = 'report'] = (command ?? '').split('-');
const target = TARGETS[kind];
const id = Number(rawId);
if (!target || !['tamper', 'restore'].includes(mode)) fail(`${TARGETS.report.usage}
       ${TARGETS.settlement.usage}`);
if (!Number.isInteger(id) || id <= 0) fail(`사용법: ${target.usage}`);

const db = createDb(config.dbFile);
const row = db.prepare(`SELECT snapshot_json FROM ${target.table} WHERE ${target.key} = ?`).get(id);
if (!row) fail(`${target.missing(id)} (DB: ${config.dbFile})`);

const backupFile = join(BACKUP_DIR, `${kind}-${id}.json`);
const save = (json) => db.prepare(`UPDATE ${target.table} SET snapshot_json = ? WHERE ${target.key} = ?`).run(json, id);

if (mode === 'tamper') {
  // 이미 변조된 상태에서 다시 실행해도 처음 원본을 기준으로 바꾼다 (두 번 실행해도 원래 값으로 돌아가지 않게)
  const original = existsSync(backupFile) ? readFileSync(backupFile, 'utf8') : row.snapshot_json;
  const snapshot = JSON.parse(original);
  const what = target.tamper(snapshot, id);

  if (!existsSync(backupFile)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    writeFileSync(backupFile, original, 'utf8');
  }
  save(JSON.stringify(snapshot));
  console.log(`[demo] ${target.label} ${id} 변조: ${what} (해시는 그대로)`);
} else {
  if (!existsSync(backupFile)) fail(`${target.label} ${id}의 변조 백업이 없습니다. 먼저 변조 명령을 실행했는지 확인하세요.`);
  save(readFileSync(backupFile, 'utf8'));
  rmSync(backupFile);
  console.log(`[demo] ${target.label} ${id} 복구: 변조 전 스냅샷으로 되돌렸습니다.`);
}

db.close();
