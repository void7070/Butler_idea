import { createHash } from 'node:crypto';

/**
 * 리포트 스냅샷 변조 감지 (순수 함수, 창 9).
 * 제출 시 snapshot_json 문자열 그대로의 SHA-256(hex)을 저장하고, 조회 때 다시 계산해 비교한다.
 * 문자열을 그대로 해시하므로 JSON 키 순서·공백까지 발행 당시와 같아야 ok다.
 */
export function hashSnapshot(snapshotJson) {
  return createHash('sha256').update(snapshotJson, 'utf8').digest('hex');
}

/**
 * @param {{ snapshotJson: string, storedHash: string|null, issuedAt: string }} row
 * @returns {{ storedHash: string|null, currentHash: string, ok: boolean, issuedAt: string }}
 *   storedHash가 없으면(해시 도입 전 데이터) ok=false
 */
export function verifySnapshot({ snapshotJson, storedHash, issuedAt }) {
  const currentHash = hashSnapshot(snapshotJson);
  return { storedHash: storedHash ?? null, currentHash, ok: !!storedHash && storedHash === currentHash, issuedAt };
}
