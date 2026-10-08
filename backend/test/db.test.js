import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, applySchema } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { getAccessibleUnits } from '../src/repositories/unitRepo.js';

let db;
beforeEach(() => {
  db = createDb(':memory:');
  applySchema(db);
  seed(db);
});

function userIdByName(name) {
  return db.prepare('SELECT id FROM users WHERE name = ?').get(name).id;
}

describe('schema + seed', () => {
  it('seed 수량이 명세와 일치', () => {
    const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    expect(count('users')).toBe(4); // + 최임차 (창 13)
    expect(count('buildings')).toBe(2);
    expect(count('units')).toBe(2);
    expect(count('reports')).toBe(6); // 기존 3 + 시연 입주·퇴거 2 (창 9) + 345호 입주 (창 13)
    expect(count('report_snapshots')).toBe(6);
    // reported(6) + draft(1) + submitted(1)
    expect(count('inspections')).toBe(8);
  });

  it('역할이 제약을 지킨다', () => {
    const roles = db.prepare('SELECT DISTINCT role FROM users ORDER BY role').all().map((r) => r.role);
    expect(roles).toEqual(['contractor', 'owner', 'tenant']);
  });

  it('스냅샷은 유효한 JSON이고 grade를 담는다', () => {
    const row = db.prepare('SELECT snapshot_json FROM report_snapshots LIMIT 1').get();
    const snap = JSON.parse(row.snapshot_json);
    expect(snap).toHaveProperty('grade');
    expect(snap.unit).toHaveProperty('name');
  });
});

describe('getAccessibleUnits', () => {
  it('contractor는 전체 호실(2개)', () => {
    const units = getAccessibleUnits(db, userIdByName('이시공'));
    expect(units).toHaveLength(2);
  });
  it('owner는 소유 호실 2개', () => {
    const units = getAccessibleUnits(db, userIdByName('김임대'));
    expect(units).toHaveLength(2);
  });
  it('tenant는 거주 호실 1개(1234호)', () => {
    const units = getAccessibleUnits(db, userIdByName('박임차'));
    expect(units).toHaveLength(1);
    expect(units[0].name).toBe('1234호');
  });
  it('없는 사용자는 빈 배열', () => {
    expect(getAccessibleUnits(db, 9999)).toEqual([]);
  });
});

describe('제약 조건', () => {
  it('reports.grade는 A~E만 허용 (CHECK)', () => {
    const unitId = db.prepare('SELECT id FROM units LIMIT 1').get().id;
    const inspId = db.prepare('SELECT id FROM inspections LIMIT 1').get().id;
    expect(() =>
      db
        .prepare(
          `INSERT INTO reports (inspection_id, unit_id, type, flow, grade, created_by)
           VALUES (?, ?, 'periodic', 'whole', 'Z', 1)`
        )
        .run(inspId + 1000, unitId)
    ).toThrow();
  });
});
