-- 스마트 점검 리포트 DB 스키마 (SQLite)
-- PRD §20 / 백엔드_PRD §4 기준. 재실행이 안전하도록 DROP 후 CREATE.
-- 계층: users → unit_users → units → inspections → (items/observations/images/ai_guides)
--                                        └→ reports → (snapshots/confirmations/share_links)

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS settlement_snapshots;
DROP TABLE IF EXISTS settlement_share_links;
DROP TABLE IF EXISTS tenant_reports;
DROP TABLE IF EXISTS settlement_items;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS lease_clauses;
DROP TABLE IF EXISTS leases;
DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS report_confirmations;
DROP TABLE IF EXISTS report_snapshots;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS ai_guides;
DROP TABLE IF EXISTS zone_confirmations;
DROP TABLE IF EXISTS inspection_images;
DROP TABLE IF EXISTS inspection_observations;
DROP TABLE IF EXISTS inspection_items;
DROP TABLE IF EXISTS inspections;
DROP TABLE IF EXISTS unit_users;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS buildings;
DROP TABLE IF EXISTS users;

-- 데모 사용자 (로그인 없음)
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('contractor', 'owner', 'tenant')),
  org        TEXT,                       -- 시공업자 소속 등 표시용
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE buildings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  address    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- 예: '1203호'
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 호실-사용자 권한 연결 (owner/tenant가 어떤 호실에 연결되는지)
CREATE TABLE unit_users (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('owner', 'tenant')),
  UNIQUE (unit_id, user_id, role)
);

-- 작성 중/제출 전/리포트 완료 점검
CREATE TABLE inspections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,             -- domain/inspectionTypes.js 코드
  flow       TEXT NOT NULL CHECK (flow IN ('baseline', 'whole', 'issue')),
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reported')),
  final_opinion TEXT,                   -- 시공업자 최종 의견
  carryover_json TEXT,                  -- 입주 전 점검이 가져온 이전 퇴거 기록 (창 20) { sourceReportId, items }
  repair_pre_report_id INTEGER,         -- 수리 후 점검이 연결한 같은 호실 수리 전 리포트 (창 26)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 전체 점검(공간별) 또는 문제 항목
CREATE TABLE inspection_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_code     TEXT,                    -- domain/itemCatalog.js 코드 (기준선 점검용, 옛 whole/issue 데이터는 NULL)
  category      TEXT,                    -- whole: 공간(거실/주방...) / issue: 분야(설비·배관...)
  name          TEXT,                    -- 항목명(창호/벽지...)
  state         TEXT,                    -- baseline: minor/damaged/broken(정상은 저장 안 함) / whole: normal/caution/repair
  location      TEXT,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 현장 확인 항목 (있음/없음/확인 필요)
CREATE TABLE inspection_observations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES inspection_items(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  value         TEXT NOT NULL CHECK (value IN ('present', 'absent', 'uncertain')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Base64 이미지 (AI 판독하지 않고 저장만)
CREATE TABLE inspection_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES inspection_items(id) ON DELETE CASCADE,
  zone          TEXT,                    -- baseline 구역 전경 사진이면 구역 이름
  data_base64   TEXT NOT NULL,
  kind          TEXT,                    -- 사진 유형
  caption       TEXT,
  byte_size     INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 구역 "이상 없음" 확인 (baseline). author=작성한 시공업자, owner/tenant=당사자 확인
CREATE TABLE zone_confirmations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  zone          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('author', 'owner', 'tenant')),
  confirmed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (inspection_id, zone, role)
);

-- AI 점검 도우미 결과 (JSON 원본 보관)
CREATE TABLE ai_guides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  payload_json  TEXT NOT NULL,           -- { summary, actionCards, requiredDocuments, cautionPhrases, opinionDraft }
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 생성 완료 리포트 메타 (1 inspection : 1 report)
CREATE TABLE reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL UNIQUE REFERENCES inspections(id),
  unit_id       INTEGER NOT NULL REFERENCES units(id),
  type          TEXT NOT NULL,           -- 비교 매칭용(같은 호실+같은 유형)
  flow          TEXT NOT NULL,
  grade         TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'E')),
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 리포트 고정 스냅샷 (생성 시점 JSON, 이후 불변)
CREATE TABLE report_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     INTEGER NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT,                    -- snapshot_json의 SHA-256 hex (창 9, 변조 감지). 해시 도입 전 행은 NULL
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 임대인/임차인 확인 완료 이력
CREATE TABLE report_confirmations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id    INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL CHECK (role IN ('owner', 'tenant')),
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (report_id, user_id)
);

-- 공유 링크 (시공업자/임대인/임차인 모두 생성 가능). 창 11부터 생성 후 7일 뒤 만료(expires_at, ISO)
CREATE TABLE share_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- 임대차 계약 (호실당 현재 계약 1건을 시연에 사용)
CREATE TABLE leases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  owner_user_id  INTEGER NOT NULL REFERENCES users(id),
  tenant_user_id INTEGER NOT NULL REFERENCES users(id),
  deposit        INTEGER NOT NULL CHECK (deposit >= 0),       -- 보증금(원)
  monthly_rent   INTEGER NOT NULL CHECK (monthly_rent >= 0),  -- 월세(원)
  start_date     TEXT NOT NULL,                               -- YYYY-MM-DD
  end_date       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 계약 특약. template_code가 있으면 domain/clauseTemplates.js 규칙(rule_json)으로 자동 적용,
-- 없으면 자유 문장 → 정산 때 "수동 확인 필요"로만 표시
CREATE TABLE lease_clauses (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id            INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  clause_no           INTEGER NOT NULL CHECK (clause_no > 0),  -- 특약 제n항
  template_code       TEXT,
  text                TEXT NOT NULL,                           -- 계약서 원문
  rule_json           TEXT,                                    -- 템플릿 규칙 + 파라미터 (자유 문장이면 NULL)
  tenant_confirmed_at TEXT,
  UNIQUE (lease_id, clause_no)
);

-- 보증금 공제 근거 (창 7). 입주 전 ↔ 퇴거 리포트 1쌍마다 1건. 금액·합계는 저장하지 않고 조회 때 계산
CREATE TABLE settlements (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id            INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  move_in_report_id  INTEGER NOT NULL REFERENCES reports(id),
  move_out_report_id INTEGER NOT NULL REFERENCES reports(id),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'hold', 'confirmed')),  -- hold: 임차인 이의 (창 11)
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at       TEXT                                                                    -- 임대인 합의 확정 시각
);

-- 정산 항목 = diff 변경 항목. 부담자는 사람이 고른다 (생성 시 기본 부담자)
CREATE TABLE settlement_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id   INTEGER NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  item_code       TEXT NOT NULL,
  estimate_cost   INTEGER CHECK (estimate_cost IS NULL OR estimate_cost >= 0),  -- 복구 견적(원), 미입력 NULL
  payer           TEXT NOT NULL CHECK (payer IN ('tenant', 'landlord', 'hold')),
  -- 부담자를 바꾼 방법 (창 16, 수선비 장부 사유): NULL 기본 부담자 / bulk_small 소액 일괄 / manual 임대인 선택
  payer_source    TEXT CHECK (payer_source IS NULL OR payer_source IN ('bulk_small', 'manual')),
  -- 임대인이 "특약 조건 해당"으로 확인한 조건부 특약의 항 번호 (창 25, 예: 반려동물 손상). NULL = 미확인
  condition_clause_no INTEGER,
  -- 임차인 링크 응답 (창 11). 항목당 한 번, 수정·삭제 없음
  tenant_response       TEXT CHECK (tenant_response IS NULL OR tenant_response IN ('agree', 'object')),
  tenant_response_text  TEXT,
  tenant_response_image TEXT,
  tenant_responded_at   TEXT,
  UNIQUE (settlement_id, item_code)
);

-- 정산 공유 링크 (창 11). 임대인이 만들고 임차인이 로그인 없이 열어 응답. 7일 뒤 만료
CREATE TABLE settlement_share_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id   INTEGER NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  first_viewed_at TEXT                                                           -- 최초 열람 시각
);

-- 확정 정산서 스냅샷 (창 15). 합의 확정 때 계산 결과를 JSON으로 동결 + 그 문자열의 SHA-256.
-- 확정 뒤 조회는 이 JSON을 그대로 돌려준다 (다시 계산하지 않음). 수정 경로 없음
CREATE TABLE settlement_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id  INTEGER NOT NULL UNIQUE REFERENCES settlements(id) ON DELETE CASCADE,
  snapshot_json  TEXT NOT NULL,
  snapshot_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 임차인 입주 제보 (창 10). 계약 시작일부터 7일 안에 입주 리포트에 대해 제보.
-- 임대인이 승인(approved)한 것만 diff에서 입주 상태로 반영 (스냅샷은 바꾸지 않는다)
CREATE TABLE tenant_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id    INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,  -- 입주 전 리포트
  item_code    TEXT NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('minor', 'damaged', 'broken')),
  text         TEXT NOT NULL,
  image_base64 TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT
);

CREATE INDEX idx_tenant_reports_report ON tenant_reports(report_id);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_unit_users_user ON unit_users(user_id);
CREATE INDEX idx_inspections_unit ON inspections(unit_id);
CREATE INDEX idx_inspections_creator ON inspections(created_by);
CREATE INDEX idx_reports_unit ON reports(unit_id);
