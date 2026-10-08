# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repo started as the 1st-semester "스마트 점검 리포트" (Smart Inspection Report) demo, which is **complete and working**: `backend/` (Express + SQLite, 107 tests) and `frontend/` (Vue 3 + Vite + Tailwind, 29 tests).

It is now being extended into the **Butler presentation features** (item-code baseline inspections, move-in ↔ move-out diff, lease clauses, per-item deposit settlement, snapshot hashing).

- **`progress.md` is the source of truth for the new work.** Read it at the start of every session: it holds the new design rules, the demo reference data, and which work window (창) is next. Work on **one window per session** only.
- **`1학기/` holds the old planning docs (PRD, per-session PRDs, harness, wireframe). They are an archive.** Do not read them unless the user asks, and do **not** update them when the code changes. Where they conflict with `progress.md`, `progress.md` wins.
- Code comments that cite "PRD §n" refer to those archived docs; leave them as they are.

## Git

- Commit **locally only**, at the end of each work window (and at sub-steps when useful). **Never `git push`, never add a remote.** This folder is intentionally not connected to any GitHub repo.
- Commit messages follow the window: e.g. `창1: 항목 코드 카탈로그`.

## Architecture

Monorepo with two packages:

- **`frontend/`** — Vue 3 + Vite + Tailwind CSS v4 + Vue Router. Dev on port **5173**. API base via `VITE_API_BASE_URL` (defaults to `http://localhost:3000`). Session in `src/stores/session.js` (localStorage). Pure logic in `src/lib/` (unit-tested); presentational components (`ReportSnapshotView`, `AiGuidePanel`) take data via props so the API call stays in the parent.
- **`backend/`** — Node.js + Express 5 + SQLite via **better-sqlite3**. Dev on port **3000**. Layered: `routes/` → `repositories/` (take `db` as first arg for test injection) → `db/`. Pure logic in `lib/` (`grading`, `validation`, `compare`, `aiSafety`). `createApp(db, { aiComplete })` accepts injected deps so tests use in-memory DB + a fake AI client. GPT key read **only** from `.env`; AI prompts in `backend/prompts/*.md`.

### Commands (Windows PowerShell 5.1 — no `&&`, run one per line)

```powershell
# backend (port 3000)
cd backend
npm run db:init               # rebuild app.db: schema + demo seed
npm run demo:reset            # same reset in place (no file delete) — works while the server is running
# backend/.env DEMO_TODAY=YYYY-MM-DD fixes the server's "today" (date + real time) for createApp/seed/reset; empty = real date
npm run dev                   # node --watch
npm test                      # vitest, all
npm test -- grading           # a single test file by name

# frontend (port 5173)
cd frontend
npm run dev
npm test
```

- Run only the tests related to the current change while working; run the full suite once before finishing a window.
- Do not run `npm audit fix` (version bumps can break the code).
- Health check: `curl http://localhost:3000/api/health`.

> ⚠️ Windows live testing: a stale `node` process holding port 3000 will serve old data. Before manually starting a server, run `Stop-Process -Name node -Force`. Vitest does not use a port, so tests are unaffected.

## Testing

Keep it light — this is a demo; test logic whose failure would break the demo.

- **Vitest on both packages.** Frontend component tests use `@vue/test-utils` + `happy-dom`; backend API tests use `supertest` with an in-memory DB (`new Database(':memory:')`).
- **Keep testable logic in pure functions** (`backend/src/lib/*`, `frontend/src/lib/*`) rather than inline in route handlers or components.
- Backend priorities: pure logic first (grading, validation, compare, and the new diff / settlement), then API integration (permissions → `403`, `reported` inspections locked, snapshot immutability).
- Frontend: only logic-bearing pieces; screens are checked manually.

## Architectural invariants (enforce these)

Still valid from the 1st semester:

- **No login.** A demo user is selected and `selectedUserId` + `selectedRole` are stored in `localStorage`. The frontend sends the user id (`x-user-id` header); the **backend re-checks permissions against the DB** (owner / tenant / contractor scopes). Never trust the role from the client alone. Unauthorized access → `403`.
- **Reports are immutable.** Submitting an inspection (`POST /api/inspections/:id/submit`) auto-generates a report and writes a frozen **snapshot JSON** (`report_snapshots`). Once an inspection is `reported`, it cannot be edited or deleted (`400`/`403`). To "change" a report, create a new one. The snapshot must not change even if the underlying inspection later changes. Do **not** expose edit/delete UI for completed reports.
- **AI never blocks the workflow.** AI failure (call error or JSON parse failure) falls back to a default template or manual entry. AI output is **JSON only** (`summary`, `actionCards`, `requiredDocuments`, `cautionPhrases`, `opinionDraft`). The report shows only the author's **final opinion**, not the raw AI draft.
- **AI is forbidden from making judgments:** no legal liability, no tenant/landlord fault assignment, no deposit-deduction decisions, no litigation/precedent claims, and **no image analysis**. **New Butler features do not use AI at all** — diff and settlement are deterministic code.
- **Image limits** (validated separately from the body-size limit): 1 image ≤ 10MB, ≤ 5 per item, ≤ 20 per report.
- **PDF is client-side only** via `window.print()` on `/reports/:id/print` with `@media print`.
- **Snapshot hashing**: every `report_snapshots` row stores `snapshot_hash` = SHA-256 of the exact `snapshot_json` string (`backend/src/lib/snapshotHash.js`, written via `reportRepo.insertSnapshot` on submit and in the seed). `GET /api/reports/:id/verify` recomputes it → `{ storedHash, currentHash, ok, issuedAt }`; the report detail and share screens show the badge. Never update `snapshot_hash` to match an edited snapshot.
- Tenants can confirm and view reports but **cannot write opinions**.
- Grades are computed at submit time; the implemented rules live in `backend/src/lib/grading.js`.
- **Inspection flow by type** (`backend/src/domain/inspectionTypes.js`): 입주 전 / 퇴거 전 / 퇴거 후 → `baseline`; 정기 → `whole`; 긴급 / 수리 전 / 수리 후 → `issue`.
  - `baseline` uses the shared item catalog (`backend/src/domain/itemCatalog.js`: 7 zones, 40 item codes). It has 4 states: `normal` / `minor` / `damaged` / `broken`, default `normal`. **Only abnormal items are stored** (`inspection_items.item_code`). A whole zone can be marked "이상 없음" via `zonesConfirmed` → `zone_confirmations` (role `author`/`owner`/`tenant`). Zone overview photos use `inspection_images.zone`.
  - Submit (`baseline` only) requires every zone to be confirmed or to have an abnormal item. A non-normal **core** item must have ≥1 photo. Otherwise `400`. Input normalization and validation live in `backend/src/lib/baseline.js`.
- **Report comparison** (`backend/src/lib/compare.js`): same unit only. Allowed pairs: same type, 수리 전 ↔ 수리 후, and 입주 전 ↔ 퇴거 전/퇴거 후 (`isBaselinePair`, either order). For a baseline pair, `GET /api/reports/compare` adds `diff` (otherwise `null`) from `backend/src/lib/diff.js` `diffBaseline(moveIn, moveOut, ITEM_CATALOG)`: walks all 40 catalog items; an unrecorded item is `normal` if its zone was confirmed, else `unknown`; only items whose move-out state is worse (normal < minor < damaged < broken) are returned, each with `evidence` `high` / `mid` / `low`. Deterministic code, no AI, no fault/deduction judgment.
- **Tenant move-in reports** (창 10, `backend/src/lib/tenantReport.js`, `routes/tenantReports.js`): on a `move_in` report the unit's tenant can file `tenant_reports` (item code + minor/damaged/broken + text + optional photo) and confirm zones (`zone_confirmations` role `tenant`) only from the lease start date through start + 7 days (no lease → report date); after that `400 REPORT_WINDOW_CLOSED` "제보 기간이 끝났습니다". Only the unit's owner approves/rejects (pending only, no deadline). The snapshot is never changed: compare and settlement pass `diffExtrasFor(db, moveInReportId)` (live tenant zones + reports) as the 4th arg of `diffBaseline`; `approved` reports raise the move-in state (`tenantReported: true`, evidence ≥ `mid`, `high` with a photo), `rejected`-only items get `disputed: true`. `createApp(db, { now })` injects the clock for tests.
- **Share links expire after 7 days** (창 11, `backend/src/lib/settlementShare.js`): report links (`share_links.expires_at`) and settlement links (`settlement_share_links`) both get `expires_at` = creation + 7 days; from that instant (or with no `expires_at`) `GET` → `410 SHARE_LINK_EXPIRED`, unknown token → `404`. Token = permission: no login.
- **Share links mask person names** (창 27, `backend/src/lib/maskName.js`): `maskName` — 1 char as is, 2 chars `김*`, 3 chars `박*차`, 4+ chars keep first and last with `*` between; empty/null as is. `GET /api/share/:token` returns `maskReportSnapshot(snapshot)` (masks `parties.*.name` on a copy); the settlement share view carries no person names. Masking is **response-only**: stored snapshot JSON and `snapshot_hash` are never changed, and `verify` is computed from the stored original. Logged-in screens and the evidence package keep real names. The link screens show "개인정보 보호를 위해 이름 일부를 가렸습니다".
- **Tenant settlement link** (창 11): only the unit's owner creates `POST /api/settlements/:id/share` (returns a **mock** notice text, `sent: false` — never actually send messages; no payment/transfer). `GET /api/share/settlement/:token` shows only tenant-payer items + the clause original text / standard basis, and records `first_viewed_at` once. `POST .../respond` `{ itemCode, response: 'agree'|'object', text?, image? }` — tenant-payer items only (`NOT_CHARGED`), **once per item, no edit/delete** (`ALREADY_RESPONDED`), objection needs text. Status is derived (`settlementStatus`): any objection on a tenant-payer item → `settlements.status = 'hold'`; `POST /api/settlements/:id/confirm` (owner) needs no objection (`SETTLEMENT_ON_HOLD`), no `hold`-payer items (`ITEMS_ON_HOLD`) and every tenant-payer item `agree` (`NOT_ALL_AGREED`). After a tenant response the owner may only move that item to `landlord` (`ITEM_RESPONDED` otherwise); the response record stays. Confirmed settlements cannot be edited or responded to.
- **Confirmed settlements are frozen** (창 15): `POST /api/settlements/:id/confirm` writes, in the same transaction, the computed settlement (items, amounts, basis + clause text, tenant responses, totals, `confirmedAt`) to `settlement_snapshots` with `snapshot_hash` = SHA-256 of the JSON string (`lib/snapshotHash.js`). After confirm, `GET /api/settlements/:id` and the settlement share link return that snapshot as-is (`frozen: true`, never recomputed; only the live `shareLink` is added), no edits allowed. `GET /api/settlements/:id/verify` (owner/tenant, `400 SETTLEMENT_NOT_CONFIRMED` before confirm) → `{ storedHash, currentHash, ok, confirmedAt }`; the share GET includes `verify` (null before confirm). Never update `snapshot_hash` to match an edited snapshot.
- **Repair ledger** (창 16, `backend/src/lib/repairLedger.js`, `GET /api/owner/repair-ledger` + `.csv`, owner only): rows come **only from confirmed settlement snapshots** (`payer === 'landlord'`, date = local date of `confirmedAt`); unconfirmed settlements' landlord items are `pending` and never counted in totals. Reason is derived from the snapshot item: tenant objection → 이의 후 임대인 부담, `payerSource === 'bulk_small'` → 소액 일괄, default payer landlord with no manual change → 자연 마모 후보, else 임대인 선택. `settlement_items.payer_source` (`NULL`/`bulk_small`/`manual`) is set by bulk-small / owner PATCH and frozen into the snapshot. CSV = UTF-8 BOM + header `확정일,호실,구역,항목,금액,사유,정산번호` + final 합계 line (CRLF). Tampered snapshots are still listed with `hashOk: false`. No tax calculation, no external sending; the screen shows "필요경비 인정 여부는 세무사 확인이 필요합니다".
- **Next move-in baseline carryover** (창 20, `backend/src/lib/carryover.js`, `GET /api/units/:id/baseline-carryover` contractor or the unit's owner; tenant `403`; no move-out report → `404 NO_PREVIOUS_MOVE_OUT`): from the unit's latest 퇴거 전/후 report, only abnormal items. An item in a **confirmed** settlement (any payer) → `suggestedState: 'normal'`, reason "퇴거 정산 항목 · 수리 확인 필요"; not in a settlement or settlement not confirmed → the move-out state, "이전 퇴거 상태 이어받음". Zone confirmations are never carried over. `PATCH /api/inspections/:id` `carryover: { sourceReportId, items: [{ itemCode, reason, repairCheckPending }] } | null` (move_in only → `CARRYOVER_NOT_MOVE_IN`; same-unit move-out report only → `INVALID_CARRYOVER`) → `inspections.carryover_json`; submit copies it into the snapshot as `carryover` (key only when present) → House Log kind `carryover`. The form fills the suggestions, keeps a yellow "수리 확인 필요" mark until the author clears it; submitting with marks left only warns (never blocks). Existing move-in reports/snapshots are never changed.
- **Repair photos are mandatory** (창 26, `backend/src/lib/repairGate.js`): `repair_pre` / `repair_post` submit needs ≥1 issue item and every item ≥1 photo linked by `itemIndex` → else `400 PHOTO_REQUIRED_REPAIR` (message names the items). `emergency` / periodic / baseline rules unchanged. `PATCH /api/inspections/:id` `repairPreReportId` (repair_post only, same-unit `repair_pre` report only → else `400 INVALID_REPAIR_LINK`) → `inspections.repair_pre_report_id`; submit adds snapshot `repairOf: { reportId, date }` (key only when linked). House Log keeps kind `report` but titles a repair_post report "수리 완료"; with `repairOf` the detail says "수리 전 리포트 #n" and the owner link is `/owner/compare?leftId=pre&rightId=post`. The form shows per-item photos only for repair types (`frontend/src/lib/issueInspection.js`).
- **Settlements (and the tenant-report window) pick the lease by the move-in report date** (창 12, `leaseRepo.getLeaseForDate`): the lease whose period contains it → else the latest lease started before it → else the earliest lease starting after it. Never use "the unit's most recent lease" there — registering a new lease must not change an old settlement.
- **Conditional clauses are confirmed by the owner, never inferred** (창 25, `lib/settlement.js`): an `auto` template clause with `rule.condition` (PET_DAMAGE) is attached to its target items as `conditionalClauses` ("해당 가능" only). The owner checks it per item via `PATCH /api/settlements/:id/items/:itemCode` `{ conditionClauseNo: n | null }` → `settlement_items.condition_clause_no` (owner only, not that item's conditional clause → `400 INVALID_CONDITION_CLAUSE`, confirmed/responded rules unchanged). Checked + payer tenant → `basis = { type: 'clause', clauseNo, kind: 'standard' }`, amount = standard depreciation; a `full_cost` clause on the same item (제3항) wins (`fullCostClauseNo`, UI checkbox disabled). Unchecked = identical to before. `npm run demo:pet` adds PET_DAMAGE as 1234호 제5항 (not in the seed; `demo:reset` removes it).
- **Owner todos** (창 13, `backend/src/lib/todos.js`, `GET /api/owner/todos`): deterministic date math on the server's local date (`now` injectable), no AI, **no notifications sent**. Legal deadlines (전월세 신고 = start + 30 days, 갱신 거절 통지 = 6–2 months before end) are guidance only and say "안내용 계산이며 법률 자문이 아닙니다". The seed's 345호 lease starts at `db:init` date − 2 days (`seed(db, { now })`), so its tenant-report window is open for the demo.
- **Settlement confirm is blocked while any item's payer is `hold`** (`ITEMS_ON_HOLD`), even with no objections — user decision, do not relax it (demo order: 소액 일괄 → 합의 확정).
- **A tenant-responded item only allows `{ payer: 'landlord' }` from the owner** (`ITEM_RESPONDED`) — user decision, do not add estimate edits, response resets, or a "reduced amount re-request" flow.

## API surface

`/api/health`, `/api/demo/users`, `/api/session/select-user`, `/api/units`, `/api/units/:id/reports`, `/api/inspections` (POST/GET/PATCH/DELETE + `/:id/submit`), `/api/ai/inspection-guide`, `/api/reports` (+ `/:id`, `/:id/verify`, `/:id/confirm`, `/:id/share`, `/compare`, `/:id/tenant-reports` GET/POST, `/:id/zone-confirm`), `/api/tenant-reports/:id/approve` · `/reject`, `/api/share/:token` (includes `verify`), `/api/share/settlement/:token` (+ `/respond`), `/api/units/:id/lease`, `/api/units/:id/leases` (GET owner/tenant — tenant sees own leases only; POST owner), `/api/leases/:id/confirm`, `/api/clause-templates`, `/api/settlements` (+ `/:id`, `/:id/verify`, `/:id/items/:itemCode` (payer / estimateCost / conditionClauseNo), `/:id/bulk-small`, `/:id/share`, `/:id/confirm`, `/:id/evidence` owner only — dispute evidence package, snapshot-based after confirm), `/api/owner/todos`, `/api/owner/repair-ledger` (+ `.csv`) (owner only), `/api/units/:id/house-log` (owner/tenant; tenant gets only own-lease events, no ledger), `/api/units/:id/baseline-carryover` (contractor / owner). All responses use a consistent JSON envelope. New endpoints added by each window are recorded in `progress.md`.

DB tables: `users`, `buildings`, `units`, `unit_users`, `inspections`, `inspection_items`, `inspection_observations`, `inspection_images`, `ai_guides`, `reports`, `report_snapshots`, `report_confirmations`, `share_links`, `zone_confirmations`, `leases`, `lease_clauses`, `settlements`, `settlement_items`, `tenant_reports`, `settlement_share_links`, `settlement_snapshots` (+ tables added by later windows, recorded in `progress.md`).

## Notes

- UI copy and report content are in Korean; keep user-facing strings in Korean.
- `.omc/` is the oh-my-claudecode workspace (session/HUD state), not project source.
