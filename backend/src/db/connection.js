import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, 'schema.sql');

/** SQLite DB를 연다. 테스트는 file=':memory:'를 넘긴다. */
export function createDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

/** schema.sql을 실행해 전체 테이블을 (재)생성한다. */
export function applySchema(db) {
  db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
}
