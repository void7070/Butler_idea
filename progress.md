# progress.md — 버틀러 발표 기능 개발 진행 기록

> 매 세션 시작 시 이 파일과 CLAUDE.md를 먼저 읽는다. **한 세션에서는 창 하나만** 작업한다.
> 하위 단계가 끝날 때마다 체크하고 커밋한다. 한도에 걸리면 `← 여기서 재개` 표시부터 다시 시작한다.
> 전체 설계 근거: `../butler_개선점_분석.md` (필요한 절만 붙여 넣고, 파일 전체는 읽지 않는다)
> `1학기/` 폴더의 옛 기획 문서는 보관본이다. 시키지 않으면 읽지 않고, 코드가 바뀌어도 고치지 않는다.

## git 규칙

- 커밋은 **로컬에만** 한다. 작업 중 되돌리기와 재개 지점 확인용이다. **`git push` 금지, 원격(`git remote add`) 추가 금지.**
- 이 폴더는 기존 GitHub 저장소와 연결되어 있지 않다. 기존 저장소를 원격으로 연결하지 않는다.
- 창 작업 중 코드가 망가지면 `git checkout .`으로 직전 커밋 상태로 되돌린다.
- 모든 창이 끝나면 사람이 직접 이력을 지우고 커밋 1개로 새 저장소에 올린다:
  ```powershell
  Remove-Item -Recurse -Force .git
  git init; git add -A; git commit -m "버틀러 발표 기능"
  git remote add origin https://github.com/아이디/새저장소이름.git
  git push -u origin main
  ```

## 목표 (발표 5분 시연)

계약 특약 선택 → 입주 기준선(이상 항목만 기록) → 퇴거 점검 → 달라진 항목만 비교 → 항목별 부담자 선택(특약 우선) → 보증금 공제 근거 확정 → DB 변조 시 "변경 감지"

## 새 설계 규칙 (코드로 강제할 것)

- 입주·퇴거 점검은 **같은 항목 코드 카탈로그**를 쓴다. 약 40개 항목(핵심 25 · 일반 15), 7개 구역.
- 항목 상태는 **정상 / 경미 / 손상 / 파손** 4단계. 기본값은 정상. 구역 단위 "이상 없음" 일괄 확인 가능.
- 핵심 항목이 정상이 아니면 사진 필수. 구역 전경 사진 1장 필수.
- 비교는 같은 호실만. 허용 조합: 같은 유형, 수리 전↔후, **입주 전↔퇴거**. 결과는 달라진 항목만(퇴거 상태가 더 나쁜 항목).
- 청구 가능성: 높음(입주 사진 + 양측 확인) / 보통(양측 확인만) / 낮음(입주 기록 없음).
- 정산은 비율이 아니라 **항목별 부담자**: 임차인 / 임대인 / 보류.
- **합의 확정은 부담자 "보류" 항목이 하나라도 남아 있으면 불가**(`ITEMS_ON_HOLD`). 이의·무응답이 없어도 마찬가지다. 시연은 소액 일괄 → 합의 확정 순서. (2026-09-26 사용자 확정, 바꾸지 말 것)
- **임차인이 응답한 항목은 임대인도 "임대인 부담으로 돌리기"만 가능**(`ITEM_RESPONDED`). 견적·다른 부담자 변경, 응답 초기화, 이의 항목 감액 재요청 기능은 만들지 않는다. (2026-09-26 사용자 확정, 바꾸지 말 것)
- 기준 적용 순서: **계약 특약 > 입주 기준선 > 표준 기준(잔존가치 = 1 − 경과 월수 ÷ (내구연수 × 12))**.
- 템플릿 특약은 자동 적용, 직접 입력한 특약은 "수동 확인 필요"로만 표시.
- 임대인 부담 항목은 수선비 장부로 간다. 소액 일괄 처리(기본 5만 원 이하 → 임대인 부담).
- 발행된 리포트는 수정·삭제 불가(기존 규칙 유지) + 스냅샷 SHA-256 저장·재검증.
- AI는 새 기능에 쓰지 않는다. 기존 AI 안전장치(금지 표현, fallback)는 유지.

## 결정 사항 (2026-09-25, 사용자 확정)

- **호실은 1234호·345호 2개만** 쓴다. 옛 1203호→1234호(임차인 연결), 1204호·201호→345호로 시드를 옮겼다.
- **내구연수는 `backend/src/domain/lifespans.js` 한 곳에 둔다** (항목 이름별, 2026-09-26 창 7에서 통일 — `itemCatalog.durabilityYears`는 삭제). 벽지 6 · 실리콘 5 · 후드 필터 8 · 방충망 5 · 바닥재 8, 그 외 기본 5년. 예시 값이며, 실제 기준(공정위 소비자분쟁해결기준)을 찾으면 그 표만 고친다.
- **청구 가능성의 "입주 사진" 해석은 신경 쓰지 않는다** (목업의 연장선이다). 구역 전경 사진이 있으면 입주 사진이 있는 것으로 보고 단순하게 구현한다.
- **재사용 가능한 기존 구조는 재사용한다.** 예: "양측 확인"은 `report_confirmations`(임대인+임차인 모두 있음)로 판단한다.
- **구역 이름은 "화장실"로 통일한다** (욕실 아님). 프론트 `inspectionSpaces.js`는 창 3에서 맞춘다.
- **README.md의 옛 내용(테스트 27개, 옛 문서 경로)은 고치지 않고 둔다.**
- **(2026-09-27) 시간대 없는 시각('YYYY-MM-DD HH:MM:SS')은 모두 서버 현지 시각으로 본다.** `demoClock.sqlDateTime`이 현지 시각을 쓰고, House Log(`houseLog.toIso`)·증빙 패키지(`evidenceView.formatStamp`)도 현지로 읽는다. 예전에는 이 둘만 UTC로 읽어 시드 시각(입주 리포트 10:00)이 19:00으로, 제보 날짜가 하루 뒤로 보였다. ISO(Z 포함) 시각은 그대로 현지로 바꿔 보여 준다. 새 코드도 이 규칙을 따른다.
- **(2026-09-27) 시드 정기 점검 리포트 날짜를 고정했다**: #1 2024-09-02, #2 2025-09-01(1234호 계약 기간 안), #3 2026-06-15(345호 현재 계약 전). 창 17에서 기준일(오늘)로 넣었더니 House Log에서 "계약 종료 뒤 정기 점검"으로 보였기 때문.
- **(2026-09-27) 증빙 패키지**: 입주 항목 사진이 없으면 그 구역 전경 사진을 "입주 사진 (구역 전경)"으로 보여 준다(비교 화면과 같은 규칙). "청구 가능성 청구 가능성" 중복 문구 제거.
- **(2026-09-27) 345호 옛 시드 리포트 id 3은 입주 전 점검 → 정기 점검(A)으로 바꿨다.** 창 13의 345호 입주 전 리포트(id 6)와 목록·비교 화면에서 똑같아 보였기 때문. id 1~6 번호는 그대로. 이를 기대하던 테스트 2개(`compare.test.js`의 `r345`, `baseline.test.js`의 345호 입주 전 조회)는 "345호 입주 전 리포트"를 직접 찾게 고쳤다.

## 시연 기준 데이터 (테스트 케이스로도 사용)

| 항목 | 입주 → 퇴거 | 청구 가능성 | 부담자 | 적용 기준 | 금액 |
|---|---|---|---|---|---|
| 거실 벽지 | 정상 → 손상 | 높음 | 임차인 | 특약 제3항(도배 24개월 이내 훼손 전액) | 480,000 (표준 참고 320,000) |
| 화장실 실리콘 | 경미 → 손상 | 보통 | 임차인 | 표준(잔존 60%) | 90,000 |
| 주방 후드 필터 | 정상 → 경미 | 높음 | 임대인(자연 마모) | — | 60,000 → 수선비 장부 |
| 베란다 방충망 | 정상 → 손상 | 낮음 | 임대인(소액 일괄) | — | 45,000 → 수선비 장부 |
| 퇴거 청소비 | — | — | 임차인 | 특약 제4항 | 200,000 |
| **합계** | | | | | **임차인 770,000 · 임대인 105,000** |

- 보증금 50,000,000 → 반환 예정 49,230,000. 경과 24개월.
- 특약 제6항 "기타 파손은 협의" → 수동 확인 필요로 표시만.

## 창별 진행 현황

- [x] **창 0 · 준비 (사람이 직접, PowerShell)** — 완료 (2026-09-25)
  - [x] `git init` · `git add -A` · `git commit -m "1학기 기준 코드"` (c7009bb)
  - [x] backend `npm install` · `.env` 생성 · `npm run db:init` · `npm test` → **107개 통과**
  - [x] frontend `npm install` · `npm test` → **29개 통과** (CLAUDE.md의 "27 tests"는 옛 숫자)
  - 참고: `npm audit` 경고는 무시한다. `npm audit fix`는 실행하지 않는다(버전 변경으로 코드가 깨질 수 있음).
- [x] **창 1 · 항목 코드 카탈로그 (백엔드)** — 완료 (2026-09-25)
  - [x] `backend/src/domain/itemCatalog.js` (구역, 항목 코드, 핵심/일반, 내구연수)
  - [x] `inspection_items.item_code` 컬럼 추가, 시드 수정 (호실 1234호·345호)
  - [x] 카탈로그 테스트, 기존 테스트 유지
- [x] **창 2 · 입주·퇴거 공통 점검 흐름 (백엔드)** — 완료 (2026-09-25)
  - [x] 입주·퇴거를 같은 코드 체계 + 4단계 상태로 변경
  - [x] 등급 계산 수정
  - [x] 퇴거 점검 생성·제출 API 테스트
  - [x] **CLAUDE.md의 "Inspection flow is derived from type" 규칙을 새 설계로 갱신**
- [x] **창 3 · 점검 폼 (프론트)** — 완료 (2026-09-25)
  - [x] 구역별 "이상 없음" 일괄 확인
  - [x] 4단계 상태 선택, 핵심 항목 표시, 핵심 이상 시 사진 필수
  - [x] 퇴거 점검 작성·제출 흐름 확인 (프론트 페이로드 → 백엔드 저장·제출을 in-memory DB로 확인. 브라우저 화면은 사람이 확인)
- [x] **창 4 · 비교 로직 (백엔드)** — 완료 (2026-09-25)
  - [x] `compare.js`에 입주 전↔퇴거 예외 추가
  - [x] `backend/src/lib/diff.js` 순수 함수 (달라진 항목만)
  - [x] 비교 API 응답에 `diff.changes[]` 추가, diff 테스트
  - [x] **CLAUDE.md의 Report comparison 규칙을 새 설계로 갱신**
- [x] **창 5 · 비교 화면 (프론트)** — 완료 (2026-09-26)
  - [x] 달라진 항목만 표시, 변경 없는 항목 접기, 청구 가능성 표시
- [x] **창 6 · 계약·특약 모델 (백엔드)** — 완료 (2026-09-26)
  - [x] `leases`, `lease_clauses` 테이블 + 특약 템플릿 규칙 5개
  - [x] 1234호 시드(특약 제3·4·6항), 조회 API, 테스트
- [x] **창 7 · 정산 계산 (백엔드)** — 완료 (2026-09-26)
  - [x] `backend/src/lib/settlement.js` 순수 함수 (부담자, 특약 우선, 표준 감가, 합계, 소액 일괄)
  - [x] 부담자 저장 API
  - [x] 위 시연 기준 데이터로 테스트 (770,000 / 105,000)
- [x] **창 8 · 정산 화면 "보증금 공제 근거" (프론트)** — 완료 (2026-09-26)
  - [x] 항목별 부담자 선택, 적용 기준(특약/표준) 표시
  - [x] 합계, 소액 일괄 버튼, 수동 확인 특약 표시
- [x] **창 9 · 해시 + 시연 준비** — 완료 (2026-09-26)
  - [x] 제출 시 스냅샷 SHA-256 저장, 검증 API, 리포트 뱃지
  - [x] 변조 시연용 스크립트 (`npm run demo:tamper` 등)
  - [x] 시연 시드 정리, 시연 순서대로 끝까지 동작 확인 (API 기준. 브라우저 화면은 사람이 확인)
- [x] **창 10 · 입주 제보 승인** — 완료 (2026-09-26)
  - [x] `tenant_reports` 테이블, 제보 기간(계약 시작일부터 7일), 임차인 구역 확인 API
  - [x] 임차인 제보 / 임대인 목록·승인·거절 API, diff에 승인 제보 반영 · 거절은 `disputed`
  - [x] 임대인 "입주 제보 승인" 화면, 임차인 리포트 화면 "이상 제보"·"구역 확인"
- [x] **창 11 · 임차인 링크 응답과 정산 보류** — 완료 (2026-09-26)
  - [x] 정산 공유 링크(7일 만료) + 리포트 공유 링크 만료, CLAUDE.md Share links 규칙을 invariants로 이동
  - [x] 링크 조회(임차인 부담 항목·특약 원문·최초 열람 시각), 항목별 동의/이의 응답(한 번, 수정·삭제 없음)
  - [x] 이의 → 정산 `hold`, 모두 동의일 때만 합의 확정
  - [x] 임차인 링크 화면, 임대인 화면 보류 배너·이의 내용·"임대인 부담으로 돌리기"·링크·합의 확정

### 추가 창 12~16 (2026-09-26 결정 — 주간 한도 여유분, 순서대로)

> 시연 기준 값(1234호 770,000 / 105,000 / 49,230,000)은 어떤 창에서도 바뀌면 안 된다. 각 창이 끝나면 `시연가이드.md`의 해당 부분도 고친다.

- [x] **창 12 · 계약·특약 등록 화면** — 완료 (2026-09-26)
  - [x] 정산의 계약 선택을 "최근 계약" → "입주 리포트 날짜가 기간에 드는 계약"으로 수정 (새 계약 등록 뒤에도 1234호 정산 값 불변 테스트)
  - [x] `POST /api/units/:id/leases`(기간 겹침 400), `GET /api/units/:id/leases`, `POST /api/leases/:id/confirm`, `GET /api/clause-templates`
  - [x] 임대인 계약 등록 화면(특약 템플릿 칩·파라미터·직접 입력), 계약 이력 화면, 임차인 "계약·특약 확인"
  - [x] 시연가이드 선택 장면 추가
- [x] **창 13 · 입주 제보 시연 데이터 + 할 일·법정 기한 계산 (백엔드)** — 완료 (2026-09-26)
  - [x] 데모 사용자 "최임차"(tenant) 추가, 345호 계약(시작일 = db:init 실행일 − 2일) + 345호 입주 리포트(tenant 구역 확인 없음)
  - [x] `lib/todos.js`: 퇴거·제보 마감·정산 보류/응답 대기·특약 미확인·전월세 신고(+30일)·갱신 거절 통지 기간(6~2개월 전)
  - [x] `GET /api/owner/todos`, 경계값·정렬·권한 테스트
  - [x] 시연가이드 시드 설명·입주 제보 장면을 345호·최임차 기준으로 수정
- [x] **창 14 · 임대인 홈 "오늘 할 일" (프론트)** — 완료 (2026-09-26)
  - [x] `OwnerHome.vue`(/owner) 할 일 카드·호실 현황, 임대인 첫 화면 변경, 내비 "홈"
  - [x] 비교 화면 query 미리 선택, 카드 → 해당 화면 링크
  - [x] 시연가이드 3장 시작에 홈 장면 추가
- [x] **창 15 · 확정 정산서 동결 + 해시** — 완료 (2026-09-26)
  - [x] `settlement_snapshots`, 확정 시 스냅샷·SHA-256, 확정 뒤 조회는 스냅샷 그대로
  - [x] `GET /api/settlements/:id/verify`, 정산·링크 화면 뱃지, `demo:tamper-settlement`/`demo:restore-settlement`
  - [x] CLAUDE.md invariants 한 줄 추가, 시연가이드 3단계 보완
- [x] **창 16 · 수선비 장부 + CSV** — 완료 (2026-09-27)
  - [x] `lib/repairLedger.js`(확정 정산 스냅샷의 임대인 부담 항목, 사유, 필터, 합계)
  - [x] `GET /api/owner/repair-ledger`, `.csv`(UTF-8 BOM·합계 줄)
  - [x] `RepairLedger.vue`, 홈·내비 링크, 세무사 확인 고지
  - [x] 시연가이드에 장부·CSV 장면 추가

### 추가 창 17~20 (2026-09-27 결정 — 주간 한도 여유분 2차, 순서대로)

> 기준: 발표 당일 실패 위험 줄이기 + "House Log" 마무리. 시연 기준 값(770,000 / 105,000 / 49,230,000)은 바뀌면 안 된다. 각 창이 끝나면 `시연가이드.md`의 해당 부분도 고친다. 한도가 빠듯하면 창 17·18까지만.

- [x] **창 17 · 시연 안정화**
  - [x] `DEMO_TODAY`(.env): 서버 "지금" = 기준일 + 실제 시각, createApp·seed·init·reset 모두 적용, `/api/health`에 `today`·`demoToday`
  - [x] 임대인 홈 날짜를 `/api/health`의 today로 표시
  - [x] `npm run demo:reset`: 파일 삭제 없이 applySchema + seed(now), 변조 백업 삭제, 켜진 서버에서 동작 확인
  - [x] 시연가이드 2·5·6장, CLAUDE.md Commands 수정
- [x] **창 18 · House Log 타임라인**
  - [x] `lib/houseLog.js`(계약·특약 확인·리포트·제보·정산 링크·응답·확정·장부 이벤트, 계약별 묶음)
  - [x] `GET /api/units/:id/house-log`(tenant는 본인 계약 기간만)
  - [x] `HouseLog.vue`: 해시 검증 요약, 계약별 타임라인, 필터, 홈·계약 이력·임차인 목록 링크
  - [x] 시연가이드 3장 마무리 장면 추가
- [x] **창 19 · 분쟁 대비 증빙 패키지**
  - [x] `GET /api/settlements/:id/evidence`(확정 전·보류·확정 후, owner만)
  - [x] `EvidencePackage.vue` 인쇄용(계약·특약 / 입주 기준선 / 항목별 비교·근거 / 임차인 응답 / 무결성 / 고지)
  - [x] 정산 화면 "분쟁 대비 증빙 자료" 버튼(보류 시 강조)
  - [x] 시연가이드 보류 장면에 선택 장면 추가
- [x] **창 20 · 다음 입주 기준선 가져오기**
  - [x] `GET /api/units/:id/baseline-carryover`(확정 정산 항목 → 정상 + "수리 확인 필요", 그 외 퇴거 상태 이어받음)
  - [x] 점검 폼 "이전 퇴거 기록 가져오기"(이전 기록 뱃지, 수리 확인 표시, 구역 확인은 새로)
  - [x] 입주 스냅샷에 carryover 기록(House Log 이벤트)
  - [x] 시연가이드 4장 선택 장면 추가

### 디자인 창 21~24 (2026-09-28 결정 — 목업 디자인을 앱에 입히기, 순서대로)

> 공통 조건:
> - 목업 `../mockup/index.html`은 `<style>` 블록과 그 창이 맡은 `SCREENS` 항목만 읽는다(파일 전체를 읽지 않는다).
> - **동작·문구·라우트·API·`data-test`는 바꾸지 않는다.** 다크 모드 없음, 새 기능 없음. 백엔드는 건드리지 않는다.
> - 색·모양은 창 21의 디자인 토큰(`frontend/src/style.css` `@theme`)과 `frontend/src/components/ui/` 공통 컴포넌트로만 쓴다.
> - 테스트는 frontend만(관련 테스트 → 끝나기 전 전체 한 번) + `vite build`. 칩·색 클래스 문자열을 바꾸면 테스트의 기대 클래스만 고친다.
> - 시연 기준 값(770,000 / 105,000 / 49,230,000)과 시연 순서는 그대로다.

- [x] **창 21 · 디자인 토큰과 앱 틀, 임대인 홈** — 완료 (2026-09-28)
  - [x] 디자인 토큰(@theme 색·글꼴·모서리), IBM Plex 글꼴 + 대체 글꼴
  - [x] 공통 컴포넌트 `components/ui/` 9개 + 렌더 테스트
  - [x] 앱 틀(App.vue): 가운데 430px 단, 앱 바, 임대인 하단 탭바, 인쇄·증빙은 넓게
  - [x] 사용자 선택·임대인 홈을 목업 home처럼, 폭 때문에 깨지는 화면 목록 기록
- [x] **창 22 · 퇴거 정산 화면 목업 디자인** — 완료 (2026-09-28)
  - [x] 비교(ReportCompareView + DiffView): 변경 카드 · 상태/청구 가능성 Pill · 사진 2칸 · 변경 없는 항목 접기
  - [x] 보증금 공제 근거(SettlementView): 부담자 SegmentedControl · 적용 기준 · 합계 박스 · "계산 근거" 바텀시트
  - [x] 임차인 정산 링크(SharedSettlement): 주소창 느낌 상단 · 동의/이의 · 무결성
  - [x] 무결성 박스(IntegrityBadge, 목업 sealbox) · 수선비 장부(RepairLedger)
- [x] **창 23 · 점검·리포트 화면 목업 디자인** — 완료 (2026-09-28)
  - [x] 시공업자 홈 · 새 점검(유형·호실 칩) · 점검 작성 틀
  - [x] 입주·퇴거 폼(구역 탭 · 구역 확인 격자 · 4단계 SegmentedControl · 사진 3열 · 요약 카드 · 이전 기록/수리 확인 warn-soft)
  - [x] 정기·긴급·수리 폼, PhotoUploader, AiGuidePanel 토큰 정리
  - [x] 리포트 목록(카드 + GradeChip + 확인 Pill, 필터 칩) · 상세·공유(요약 · sealbox · 공간별 카드) · 인쇄는 글꼴만
- [x] **창 24 · 남은 화면 목업 디자인과 전체 정리** — 완료 (2026-09-28)
  - [x] 계약(LeaseList · LeaseForm · 임차인 "확인할 계약" 카드): 목업 lease-list · lease-form · t-lease
  - [x] 입주 제보(TenantBaselineActions · TenantReportReview): 목업 t-movein · movein-review
  - [x] House Log 타임라인 · 증빙 패키지 글꼴·색 토큰
  - [x] 옛 Tailwind 색 클래스 정리, 창 21 "폭 430px에서 어색한 화면" 목록 처리, 430px 가로 넘침 확인
  - [x] 시연가이드 화면 모양 설명(하단 탭바 · 색 이름)

### 보완 창 25~28 (2026-10-05 결정 — 발표 메시지와 실제 동작의 빈 곳 메우기, 순서대로)

> 공통 조건:
> - **시드 데이터와 시연 기준 값(770,000 / 105,000 / 49,230,000)은 바꾸지 않는다.** 리포트 id 1~6, 할 일 4건, 수선비 장부 105,000원도 그대로.
> - 화면은 창 21 토큰·`components/ui/`를 쓴다. 기존 문구·`data-test`는 바꾸지 않는다(새로 추가는 가능).
> - AI는 쓰지 않는다. 판단이 필요한 것은 사람이 고르고, 코드는 근거만 붙인다.
> - 관련 테스트만 → 끝나기 전 backend·frontend 전체 한 번씩 + `vite build`. 창이 끝나면 `시연가이드.md` 해당 부분, 규칙이 바뀌면 CLAUDE.md invariants 한 줄.
> - 시간이 부족하면 창 28(외관만)은 빼도 된다.

- [x] **창 25 · 반려동물 특약 정산 연결** — 완료 (2026-10-05)
  - [x] `settlement_items.condition_clause_no` 컬럼(schema · reset · repository)
  - [x] `lib/settlement.js`: 조건부 특약을 항목별 `conditionalClauses`로 붙이고, 임대인 확인 시 근거 = 특약(금액은 표준 감가), full_cost 특약이 있으면 그쪽 우선
  - [x] `PATCH /api/settlements/:id/items/:itemCode` `{ conditionClauseNo }`(owner만, `INVALID_CONDITION_CLAUSE`, 확정 후·응답 후 기존 규칙대로 차단)
  - [x] 확정 스냅샷·증빙 패키지·임차인 링크에 반영
  - [x] SettlementView "특약 제n항 해당 가능 · 원인 확인 필요" 안내 + 체크 상자(full_cost 적용 항목은 비활성), `settlementView.js` 테스트
  - [x] `npm run demo:pet`(1234호 계약에 제5항 임시 추가, `demo:reset`으로 사라짐), 1234호 기본 시연 값 불변 테스트
  - [x] 시연가이드 4장 선택 장면, CLAUDE.md invariants
- [x] **창 26 · 수리 전후 사진 필수와 수리 완료 기록** — 완료 (2026-10-05)
  - [x] `lib/repairGate.js`: 수리 전·수리 후 점검은 항목 1개 이상 + 항목마다 사진 1장 이상(`PHOTO_REQUIRED_REPAIR`), 긴급·정기·baseline은 그대로
  - [x] 수리 후 점검 ↔ 수리 전 리포트 연결(`repairPreReportId`, `INVALID_REPAIR_LINK`), 스냅샷 `repairOf`
  - [x] House Log "수리 완료" 이벤트 + 수리 전↔후 비교 링크
  - [x] IssueInspectionForm 사진 필수 표시·요약·수리 전 리포트 선택, 표시 로직 테스트
  - [x] 시연가이드 4장 선택 장면(345호 수리 전 → 수리 후), CLAUDE.md invariants
- [x] **창 27 · 공유 링크 이름 가리기**
  - [x] `lib/maskName.js`(2글자 김* · 3글자 박*차 · 4글자 이상 첫·끝만) + 경계값 테스트
  - [x] `/api/share/:token` · `/api/share/settlement/:token` 응답의 사람 이름 가리기(응답 단계에서만, 스냅샷·해시 불변)
  - [x] 공유 응답 JSON에 시드 실명 4개가 없음 · verify 결과 불변 · 로그인 화면은 실명 유지 테스트
  - [x] 링크 화면 안내 한 줄, CLAUDE.md "Names are still not masked" 문장 교체, 시연가이드 반영
- [x] **창 28 · 숫자 글꼴 정리** — 완료 (2026-10-05)
  - [x] `num`/`font-mono` 사용처 목록(약 60곳) 중 한글이 섞인 곳만 숫자 부분 `<span class="num">`으로 분리
  - [x] 표 머리글은 정렬 유지·글꼴만 기본, 인쇄 화면도 같은 기준 확인
  - [x] 고친 곳·일부러 둔 곳 목록 기록

## 세션 기록 (최신이 위)

<!--
형식:
### 창 N · 작업명 — 완료 / 진행 중 (YYYY-MM-DD)
- 한 일:
- 수정 파일:
- 테스트: npm test -- xxx (통과/실패)
- 다음 창 주의:
- ← 여기서 재개: (진행 중일 때만)
-->

### 창 28 · 숫자 글꼴 정리 — 완료 (2026-10-05)
- 한 일: 창 21의 숫자 글꼴(`.num`, IBM Plex Mono)이 한글 섞인 문장 전체에 붙어 한글이 고정폭으로 띄어 보이던 곳을 고쳤다. 한글은 기본 글꼴, 숫자·날짜·금액·해시·D-day 부분만 `.num`. 색·크기·배치·문구·`data-test`·API·백엔드 변경 없음.
  - **`lib/numText.js` `splitNum(text)`**(순수): lib 함수가 만든 문구(windowText·basisText·referenceText·amountText·합계 값·D-day 라벨·`toLocaleTimeString`)는 그대로 두고 화면에서만 `[{ text, num }]` 조각으로 나눈다(이어 붙이면 원문). 숫자 조각 = `D-DAY`·`D±n`·숫자로 시작·끝나는 `, . : / -` 묶음 + 뒤의 `%`/`원`. **`components/ui/NumText.vue`**가 숫자 조각만 `<span class="num">`으로 그린다(창 22 IntegrityBadge와 같은 방식).
  - `evidenceView.coverView`에 `hashParts: [{ key, label, hash }]` 추가(`hashes` 문자열은 그대로).
- **고친 곳**(한글 섞임 → 숫자만 `.num`):
  - `DiffView` 상단 "입주 날짜 → 퇴거 후 점검 날짜"
  - `SettlementView` 상단 "입주 … → 퇴거 …", 표준 기준 basisText, referenceText("참고: 표준 기준 n원" 등), 합계 값(dd — "계약 정보 없음"일 수 있음), 계산식 시트 금액, 계산식 `<pre>`(브라우저 기본 mono라 `font-sans` + 숫자만 span)
  - `SharedSettlement` "입주 … · 경과 n개월", "링크 유효 …까지 · 최초 열람 …", 표준 기준 basisText, referenceText, "… 기록 · 수정 불가"
  - `TenantReportReview` "제보 기간 … · 계약 시작일부터 7일", "제보 … · 처리 …", D-day 칩 / `TenantBaselineActions` 제보 기간 줄, D-day 칩
  - `DdayChip` 바탕의 `num` 제거 → 부르는 쪽(OwnerHome·TenantReportReview·TenantBaselineActions)이 `<NumText>`로 ("D+208 지남", "바로 확인", "제보 마감"에 한글)
  - `InspectionEdit` "저장됨 오후 10:56:34"
  - `BaselineInspectionForm` 요약 "항목 n · 구역 확인 n/n · 이상 n · 사진 n"
  - `HouseLog` 무결성 칩: 정상(🔒 해시)만 `num`, "⚠ 변경 감지"는 기본 글꼴
  - `ReportSnapshotView`·`PrintableReport`(인쇄) 등급 "A등급" → 등급 글자만
  - `EvidencePackage`(인쇄) 표지 해시 요약(라벨 한글), 합계 값, 무결성 "저장 …/현재 …"
  - `RepairLedger` 표 머리글 "금액": `text-right` 유지, `num`만 제거
- **일부러 둔 곳**(숫자·URL·해시만 표시): `IntegrityBadge`(이미 해시만), `PhotoUploader` (n/n), `ReportListCards` · 날짜, `GradeChip` 등급 글자, `HouseLog` 날짜/시각 칸, `LeaseList` 계약 기간·확인 시각·보증금·월세, `TenantReports` 기간·금액, `BaselineInspectionForm` carryover 날짜, `ReportSnapshotView`·`PrintableReport` 발행 시각(span), `RepairLedger` 날짜·금액·#정산번호·합계·카드 금액, `SettlementView` 견적 입력칸·임차인 부담 금액·응답 시각·고정 특약 금액·공유 URL(`<code>`), `SharedSettlement` 주소창 URL·금액·합계, `ReportDetail` 공유 링크 URL.
  - `LeaseForm`·`SettlementView` 숫자/날짜 입력칸: 입력값은 숫자라 `num` 유지. placeholder "예: 30,000,000"의 "예:"는 input 안이라 나눌 수 없어 그대로 둔다.
- 수정 파일: frontend `lib/numText.js`(신규), `components/ui/NumText.vue`(신규), `components/ui/DdayChip.vue`, `lib/evidenceView.js`, `components/` DiffView·BaselineInspectionForm·ReportSnapshotView·TenantBaselineActions, `views/` SettlementView·SharedSettlement·TenantReportReview·OwnerHome·InspectionEdit·HouseLog·RepairLedger·PrintableReport·EvidencePackage, `test/numText.test.js`(신규), `test/ui.test.js`(DdayChip), `test/evidenceView.test.js`(hashParts)
- 테스트: frontend `npm test` → **170개 통과**(167 + 신규 3), `vite build` 통과. 백엔드 변경 없음.
- 다음 창 주의: 한글 섞인 문장에 숫자 글꼴이 필요하면 바탕에 `num`을 붙이지 말고 `<NumText :text>` 또는 값만 `<span class="num">`. `DdayChip`은 이제 바탕 글꼴이 기본이라 라벨을 `<NumText>`로 넘긴다.

### 창 27 · 공유 링크 이름 가리기 — 완료 (2026-10-05)
- 한 일: 로그인 없이 여는 공유 링크에서 사람 이름을 가렸다. 응답 단계에서만 가리고 저장된 스냅샷 JSON·해시는 그대로. 새 기능·시드 변경 없음.
  - **`lib/maskName.js`**(순수): `maskName` — 1글자 그대로, 2글자 "김*", 3글자 "박*차", 4글자 이상 첫·끝만 남기고 가운데 `*`(글자 수만큼), 빈 값·null·문자열 아님은 그대로. `maskReportSnapshot(snapshot)` — `parties`(시공업자·임대인·임차인)의 `name`만 가린 복사본(원본 객체 불변, null 그대로).
  - **`GET /api/share/:token`**: `report`를 `maskReportSnapshot`으로 감싼다. `verify`는 예전처럼 DB의 원본 `snapshot_json`으로 계산하므로 뱃지 결과 불변(변조 시 여전히 "변경 감지").
  - **정산 링크**(`GET /api/share/settlement/:token`·`/respond`): 확인해 보니 `buildShareView`에 사람 이름 필드가 원래 없다(항목 `name`은 품목 이름). 코드는 그대로 두고, 확정 전·응답 후·확정 후(동결 스냅샷) 응답에 실명이 없는지 테스트로 고정했다.
  - 로그인 화면(`GET /api/reports/:id` 등)·증빙 패키지는 실명 그대로(코드 변경 없음).
  - **화면**: `SharedReport.vue`(인쇄 버튼 줄 아래), `SharedSettlement.vue`(머리 카드 링크 유효 줄 아래)에 흐린 안내 한 줄 "개인정보 보호를 위해 이름 일부를 가렸습니다"(`data-test="name-mask-note"`). 이름은 서버 값을 그대로 보여 준다.
- 수정 파일: backend `lib/maskName.js`(신규), `routes/api.js`, `test/maskName.test.js`(신규) · frontend `views/SharedReport.vue`, `views/SharedSettlement.vue` · `CLAUDE.md`(invariant 교체), `시연가이드.md` 3단계 2번
- 테스트: backend `npm test` → **321개 통과**(315 + 신규 6: maskName 경계값, 스냅샷 복사본, 시드 리포트 6개 공유 응답 실명 없음·verify 불변·스냅샷/해시 행 불변, 변조 시 공유 verify false, 정산 링크 3시점 실명 없음, 로그인 API 실명 유지). frontend `npm test` → **167개 통과**(변경 없음), `vite build` 통과.
- 다음 창 주의: 리포트 본문 자유 입력(최종 의견 등)에 사람이 이름을 직접 쓰면 그건 가리지 않는다(구조화된 이름 필드만 대상).

### 창 26 · 수리 전후 사진 필수와 수리 완료 기록 — 완료 (2026-10-05)
- 한 일: 기획서 13p "시공 전/중/후 사진 100% 기록" 중 수리 전·후 부분을 실제 동작으로 만들었다. AI 없음, 시드 변경 없음(리포트 id 1~6·시연 값 그대로), 견적·업체 배정 없음.
  - **`lib/repairGate.js`**(순수): `validateRepairSubmission(inspection)` — `repair_pre`/`repair_post`만, 문제 항목 0개 또는 사진(이미지 `item_id` = 저장 때 `itemIndex`)이 없는 항목이 있으면 `400 PHOTO_REQUIRED_REPAIR`, 메시지 "…사진이 없는 항목: 문제 항목 n(분야 항목)". 긴급·정기·baseline은 그대로(라우트 submit에서 baseline 검증 다음에 호출). `itemsWithoutPhoto`, `assertRepairLink`, `normalizeRepairLinkInput`.
  - **연결**: `inspections.repair_pre_report_id`(schema.sql만 — db:init·demo:reset 반영). `PATCH /api/inspections/:id` `repairPreReportId`(숫자 | null) — 수리 후 점검 + 같은 호실 `repair_pre` 리포트만, 아니면 `400 INVALID_REPAIR_LINK`. 유형을 수리 후가 아닌 것으로 바꾸면 연결을 푼다. `getInspectionById`는 `repairPreReportId`(camelCase)로 돌려준다. 제출 때 `buildSnapshot`이 `repairOf: { reportId, date }`(수리 전 리포트 발행일 YYYY-MM-DD, 연결 있을 때만 키)를 넣는다 → 해시 포함, 기존 스냅샷 불변.
  - **`GET /api/reports`** 행에 `unitId` 추가(시공업자 화면의 같은 호실 수리 전 리포트 목록용, 기존 필드 그대로).
  - **House Log**: 이벤트 종류는 그대로 `report`. 수리 후 리포트는 제목 "수리 완료", detail "수리 후 점검 리포트 #n · 등급 · 이상 n건 · 수리 전 리포트 #m"(연결 있을 때). link는 임대인 + 연결 있으면 `/owner/compare?leftId=수리전&rightId=수리후`(비교 화면이 query로 바로 비교), 그 밖(임차인·연결 없음)은 리포트 상세. 정렬 규칙 그대로.
  - **화면**: `issueInspection.js`에 `isRepairType`·`splitImages`·`buildImagesPayload`·`repairPhotoSummary`("사진 없는 항목 n개 (문제 항목 …)")·`repairPreOptions`. `IssueInspectionForm` `photoRequired`·`initialImages` prop — 수리 전·후면 항목 제목 옆 "사진 필수"(사진 있으면 ok, 없으면 crit), 항목 카드 안 사진 칸(PhotoUploader, 5장, 추가 즉시 저장), 저장 띠 위 요약. 항목 사진은 items와 함께 저장한다(items 교체 시 FK로 항목 사진이 지워지므로). 항목에 안 붙은 예전 사진은 그대로 보낸다. 긴급은 예전처럼 공용 사진 칸. `InspectionEdit`: 수리 전·후면 공용 PhotoUploader를 숨기고 제출 전에 폼 페이로드(항목·사진)도 저장, 수리 후면 "수리 전 리포트 선택" 드롭다운(같은 호실 수리 전 리포트, "연결 안 함", 바꾸면 바로 PATCH). 백엔드 400 메시지는 기존 오류 줄에 그대로. `data-test` 신규: repair-photo-required · repair-photo-summary · repair-pre-select.
- 수정 파일: backend `db/schema.sql`, `lib/repairGate.js`(신규), `lib/houseLog.js`, `repositories/inspectionRepo.js`·`reportRepo.js`, `routes/inspections.js`, `test/repairGate.test.js`(신규), `test/compare.test.js`(수리 전↔후 비교 테스트에 항목 사진 1장 추가 — 새 규칙) · frontend `lib/issueInspection.js`, `components/IssueInspectionForm.vue`, `views/InspectionEdit.vue`, `test/issueInspection.test.js`, `test/issueInspectionForm.test.js`(신규) · `시연가이드.md` 4장(새 선택 장면, 목업 목록 문구), `CLAUDE.md`
- 테스트: backend `npm test` → **315개 통과**(308 + 신규 7: 순수 2, 사진 없음 400·추가 후 201, 항목 없음 400·긴급 그대로, 연결 검증(다른 호실·긴급·없는 id·문자열·수리 전 점검) 400, 스냅샷 repairOf·키 없음·기존 스냅샷 불변, House Log 수리 완료·비교 링크). frontend `npm test` → **167개 통과**(신규 5 lib + 2 컴포넌트). `vite build` 통과.
- 다음 창 주의: 화면(사진 필수 뱃지·요약·드롭다운)은 브라우저로 확인하지 않았다 — 사람이 시연가이드 새 장면대로 한 번 눌러 볼 것. 수리 후 점검 화면의 수리 전 리포트 목록은 시공업자 본인이 만든 리포트만 나온다(`GET /api/reports` 권한 그대로).

### 창 25 · 반려동물 특약 정산 연결 — 완료 (2026-10-05)
- 한 일: 계약 등록에서 고를 수 있지만 정산에 영향이 없던 PET_DAMAGE("반려동물 손상", rule.kind 'standard', condition 'pet_damage')를 정산에 연결했다. **원인은 코드가 판단하지 않는다** — 임대인이 항목마다 "특약 조건 해당"을 체크한다. AI 없음, 시드·템플릿 규칙 구조 변경 없음.
  - **DB**: `settlement_items.condition_clause_no INTEGER NULL`(임대인이 확인한 조건부 특약 항 번호, NULL = 미확인). schema.sql만 고치면 db:init·demo:reset(applySchema) 모두 반영. `settlementRepo` list/update에 `conditionClauseNo`.
  - **`lib/settlement.js`**: `conditionalClausesFor(clauses, itemName)`(auto + rule.condition + payer tenant + targetItemNames) → 행마다 `conditionalClauses: [{ clauseNo, title, text, condition }]`(체크 전에도 "해당 가능" 안내용), `conditionClauseNo`, `fullCostClauseNo`(먼저 적용되는 full_cost 특약, 부담자와 무관하게 계산 — 화면 비활성 판단용). 임차인 부담 + 체크 + 그 항목의 조건부 특약 + full_cost 없음 → `basis = { type: 'clause', clauseNo, kind: 'standard', stdAmount, residual }`, 금액 = stdAmount. full_cost가 있으면 기존 제3항 근거 그대로(`kind` 없음). 체크가 없으면 basis·금액이 예전과 완전히 같다.
  - **API** `PATCH /api/settlements/:id/items/:itemCode` `{ conditionClauseNo: n | null }`: 정산이 쓰는 계약(입주 리포트 날짜 기준)에서 그 항목(카탈로그 이름)의 조건부 특약 번호만 허용, 아니면(문자열 '5' 포함) `400 INVALID_CONDITION_CLAUSE`. owner만·확정 뒤 `SETTLEMENT_CONFIRMED`·응답 뒤 `ITEM_RESPONDED`는 기존 규칙 그대로. full_cost 항목에 체크를 저장하는 것은 막지 않는다(금액 영향 없음, 화면에서 비활성).
  - **스냅샷·링크·증빙**: 확정 스냅샷은 `computeSettlementBody` 그대로라 `conditionClauseNo`·`conditionalClauses`·`basis.clause`(특약 원문)가 함께 동결된다. 임차인 링크 항목에 `conditionClauseNo` 추가(원문은 `basis.clause`). 증빙 패키지 `basisView`는 kind 'standard'면 "계약 특약 제n항 적용(임대인 확인) · 표준 기준 금액: 견적 × 잔존 = 금액" + 항목에 `conditionClauseNo`.
  - **화면**: `settlementView.conditionClauseViews(item)`(안내 "반려동물 특약 제n항 해당 가능 · 원인 확인 필요" / full_cost 있으면 "…제n항도 해당 가능 · 제m항이 먼저 적용됨" + 비활성, 체크 라벨 "이 손상은 특약 조건(반려동물)에 해당함"), `conditionPatch`, `CONDITION_LABELS`. `itemAmountView`·`shareBasisView`·`evidenceView.itemCardView`가 kind 'standard'면 "계약 특약 제n항 (반려동물 손상) · 표준 기준 금액". SettlementView 항목 카드 금액 상자 아래에 안내 + 체크 상자(warn-soft, 비활성이면 회색 테두리, `data-test` condition-clause/condition-notice/condition-check 신규).
  - **`npm run demo:pet`**(`scripts/pet.js` → `src/db/demoPet.js addDemoPetClause`): 1234호 입주 리포트 날짜의 계약에 PET_DAMAGE를 제5항으로 추가(이미 있으면 그대로), 임차인 확인 시각은 그 계약의 기존 확인 시각으로 넣어 "특약 미확인" 할 일이 생기지 않게 했다. 출력 한 줄. `demo:reset`이면 사라진다(임시 DB로 확인).
- 시연 장면: demo:pet 뒤 1234호 정산의 반려동물 특약 대상은 거실 벽지뿐이고 제3항(full_cost)이 먼저라 안내만 보이고 금액은 그대로(770,000 / 105,000 / 49,230,000). 금액이 바뀌는 경우(제3항 없는 계약 → 벽지 320,000, 임차인 610,000)는 테스트로 보였다.
- 수정 파일: backend `db/schema.sql`, `db/demoPet.js`(신규), `scripts/pet.js`(신규), `package.json`, `lib/settlement.js`, `lib/evidencePackage.js`, `repositories/settlementRepo.js`, `routes/settlements.js`, `test/petClause.test.js`(신규) · frontend `lib/settlementView.js`, `lib/settlementShareView.js`, `lib/evidenceView.js`, `views/SettlementView.vue`, `test/settlementView.test.js`, `test/settlementShareView.test.js`, `test/evidenceView.test.js` · `시연가이드.md` 4장, `CLAUDE.md`
- 테스트: backend `npm test` → **308개 통과**(295 + 신규 13: 체크 전·후 근거·금액, full_cost 우선, 잘못된 항 번호 400, 권한·확정 후·응답 후 차단, 스냅샷·링크·증빙 포함, 1234호 시연 값 불변, demo:pet). frontend `npm test` → **160개 통과**(신규: 조건부 특약 표시 5 + 화면 1 + 링크·증빙 근거 문구). `vite build` 통과.
- 다음 창 주의: 화면(체크 상자 모양·위치)은 사람이 브라우저에서 확인할 것. 조건 라벨은 `CONDITION_LABELS`에 pet_damage만 있다(새 조건부 템플릿을 만들면 추가).

### 창 24 · 남은 화면 목업 디자인과 전체 정리 — 완료 (2026-09-28)
- 한 일: 목업 lease-list · lease-form · t-lease · t-movein · movein-review를 창 21 토큰·`components/ui/`로 입히고, 앱 전체에 남은 1학기 색을 정리했다. 동작·문구·`data-test`·라우트·API는 그대로.
  - **계약 이력(LeaseList)**: accent 뒤로 링크, 제목 + ghost sm "House Log", primary 전폭 "+ 새 계약 등록", 계약 카드(기간 mono 13.5px + 확인 Pill 완료 ok · 확인 전 warn · 특약 없음 plain, "임차인 · 보증금 · 월세" 금액 mono, 구분선, 특약 줄 = 굵은 "특약 제n항 · 제목" + 모드 Pill + quote 원문 + 확인 시각 mono).
  - **특약 모드 색** `leaseForm.APPLY_MODE_TONE`(새 export): 정산 자동 적용 acc · 표시만 plain · 수동 확인 필요 warn. 계약 이력·등록·임차인 카드가 같이 쓴다.
  - **계약 등록(LeaseForm)**: 카드 대신 eyebrow "계약 정보"/"특약" + field(label 12px ink-2 + `.input` 토큰), 보증금·월세·날짜 2열(`grid-cols-2` 고정, 금액·날짜 mono), 안내는 note(회색 작은 글씨), 템플릿 특약 `Chip`(선택 accent), 특약 카드(AppCard + 모드 Pill, 파라미터 입력 mono + 단위, 미리보기 quote, "삭제" accent 링크), ghost 전폭 "+ 직접 입력 특약 추가", primary 전폭 "계약 등록".
  - **임차인 "확인할 계약"(TenantReports)**: AppCard `border-warn!`(목업 border-color warn), eyebrow, 기간 mono, 특약 줄 + 모드 Pill + quote, primary 전폭 "계약·특약 확인".
  - **입주 확인(TenantBaselineActions)**: AppCard `border-accent!`, "입주 확인" + `DdayChip`, 제보 기간 mono, 버튼 2칸(열린 쪽 primary · 나머지 ghost), 제보 폼 = 구역·항목 `Chip`(예전 select 2개 → 칩, 구역을 바꾸면 항목 초기화 그대로), 상태 `SegmentedControl`(`REPORT_STATE_OPTIONS`), textarea input, 파일 input은 `file:` 유틸리티로 ghost sm 모양(문구 추가 없음), primary "제보하기". 구역 확인 = 목업처럼 줄 목록(구역 이름 + ghost sm "이상 없음 확인" / ok Pill "✓ 임차인 확인"). 내 제보 = 구분선 아래 "구역 · 이름 + 상태 Pill" + 처리 Pill.
  - **입주 제보 승인(TenantReportReview)**: 18px 제목 + DdayChip, 기간 mono, note, 임대인 전용 안내 Banner plain, 구역 확인 카드(eyebrow + "미확인 구역 n" warn + **zgrid 4열** `rounded-[9px]` 칸, 확인 ok-soft · 미확인 surface-2), 대기·승인·거절 개수, 제보 카드(제목 "구역 · 이름", 핵심 dark/일반 plain + 상태 Pill, 처리 Pill, 사진 4:3, 제보 시각 mono, 승인 primary · 거절 ghost 2칸).
  - **`tenantReportView.js` 색**: `statusBadge` 대기 warn · 승인 ok · 거절 crit(+`tone`, `class`=PILL_TONE), `deadlineBadge` 제보 기간 중 warn(목업 D-5) · 2일 이하/D-DAY crit · 마감 calm(+`severity`, `class`=DDAY_TONE), `zoneCells` 목업 zcell(확인 `bg-ok-soft font-semibold text-ok` · 미확인 `bg-surface-2 text-ink-3`).
  - **House Log**: 목업 `.timeline` — 한 줄 = 날짜·시각 mono(76px) · 9px 점 · 내용(종류 Pill(이모지 그대로) + 해시 칩 + 제목 + 설명). 점 색 `houseLogView.KIND_META.dot`: 계약·특약 확인 `bg-seal` · 점검·이어받음·입주 제보 `bg-accent` · 정산 링크·임차인 응답 `bg-warn` · 합의 확정·수선비 장부 `bg-ok` · 계약 종료·기타 `bg-ink-3`. 무결성 요약 = sealbox 축소판(정상 `border-seal bg-seal-soft text-seal` · 변경 `border-crit bg-crit-soft text-crit` · 대상 없음 line/surface), 해시 칩 seal-soft/crit-soft, 필터 `Chip`, 계약 구획 AppCard. 테스트는 기대 클래스 'red' → 'crit' 2곳만.
  - **증빙 패키지(EvidencePackage)**: 레이아웃 그대로 색만 토큰으로(slate → ink/ink-2/ink-3/line/surface-2, emerald → ok, red → crit, amber → warn), 해시·합계 금액 `num`, 뒤로 링크 accent, 인쇄 버튼 accent.
  - **인쇄 리포트(PrintableReport)**: 화면에만 보이는 윗부분(불러오는 중 · 오류 · "인쇄하기" 버튼)만 토큰으로.
  - **창 21 "폭 430px에서 어색한 화면" 목록**: 리포트 상세 사진 3열·참여자 줄(창 23 2열·한 줄), 비교 선택(창 22 위아래), 리포트 목록 2열(창 23 한 열), 정산(창 22), 제보 구역 `sm:grid-cols-4`(이번 창 목업 zgrid / 줄 목록), 새 점검 유형(창 23 칩), LeaseForm(이번 창 `grid-cols-2` 고정)·정기·긴급 폼·AiGuidePanel·PhotoUploader(창 23), 수선비 장부 표(창 22 카드 안 가로 스크롤) — 모두 처리. `src`에 남은 `sm:` 반응형은 넓은 화면 전용인 증빙 패키지·인쇄 리포트뿐.
  - `시연가이드.md`: "상단 내비/상단 '리포트'·'홈'" → "아래 탭바", 인쇄 때 숨는 "내비" → "탭바", House Log 요약 "초록" → "파란 테두리", 계약 등록 안내 "파란 안내" → "'특약' 제목 아래 회색 안내", "확인할 계약" 카드 "노란" → "주황 테두리". 순서·문구·값은 그대로.
- **남긴 옛 색 클래스 (이유)**:
  - `PrintableReport.vue` 인쇄되는 본문(`<article>`)의 `text-slate-*`·`bg-slate-50/100`·`border-slate-200`·`divide-slate-100` — 인쇄 전용 부분. 창 23에서 예전 인쇄 레이아웃을 일부러 그대로 옮겼다(글꼴만 토큰).
  - `App.vue` `print:bg-white` 2곳 — 인쇄 때 흰 바탕(인쇄 전용).
  - `text-white` — `AppButton variant="seal"`·정산 화면 강조 증빙 버튼(`bg-crit text-white`): 목업 `.btn.seal`도 `#fff` 고정이라 토큰이 없다.
  - 그 밖에 `src`에서 slate·gray·emerald·sky·indigo·violet·amber·red·orange·blue 등 Tailwind 기본 색 클래스는 0개(grep 확인).
- 수정 파일: `frontend/src/views/LeaseList.vue`·`LeaseForm.vue`·`TenantReports.vue`·`TenantReportReview.vue`·`HouseLog.vue`·`EvidencePackage.vue`·`PrintableReport.vue`(화면용 윗부분만), `src/components/TenantBaselineActions.vue`, `src/lib/leaseForm.js`(`APPLY_MODE_TONE`)·`tenantReportView.js`·`houseLogView.js`(색만), `test/houseLogView.test.js`(기대 클래스만), `시연가이드.md`
- 테스트: frontend `npm test` 154개 통과(20 파일), backend `npm test` 295개 통과(28 파일, 코드 변경 없음), `vite build` 통과.
- 화면 확인: 스크래치 DB(`DB_FILE`)로 백엔드를 띄우고(떠 있던 5173 Vite) 430px 헤드리스 크롬 18개 화면 — 계약 이력·등록(칩 선택 뒤), 임차인 목록(확인할 계약), 임차인 입주 확인(제보 폼·구역 확인), 입주 제보 승인, House Log(임대인·임차인), 증빙 패키지, 임대인 홈·리포트 목록·리포트 #5·비교·수선비 장부, 시공업자 홈·새 점검, 인쇄, 사용자 선택. 모두 `scrollWidth` = 430(가로 넘침 없음, 표는 수선비 장부 카드 안에서만 가로 스크롤). 앱 `app.db`는 건드리지 않음.
- 다음 창 주의: AppCard 테두리 색을 바꿀 때는 `border-warn!`처럼 important를 붙인다(기본 `border-line`과 같은 속성이라 순서에 기대지 않기). 창 22의 증빙 강조 카드 `border-2 border-crit`은 그대로 두었다. 제보 기간 문구는 목업처럼 한 줄 전체 mono라 한글 간격이 넓게 보인다.

### 창 23 · 점검·리포트 화면 목업 디자인 — 완료 (2026-09-28)
- 한 일: 목업 insp-new · insp-form · report-list · report를 창 21 토큰·`components/ui/`로 입혔다. 점검 저장·제출·검증 규칙, 이미지 한도, 문구, `data-test`, API는 그대로.
  - **새 공통 컴포넌트** `ui/Chip.vue` (목업 .chip, `pressed` → accent + `aria-pressed`, 클릭은 부모). 새 점검 유형·호실, 리포트 목록 필터에 쓴다.
  - **시공업자 홈**: 작성 중/제출 대기 두 묶음(computed `groups`), 누르는 AppCard + 상태 Pill(작성 중 warn · 제출 대기 seal), "새 점검 시작" primary sm.
  - **새 점검**: 유형 7개 칩 + 흐름 안내, 호실 칩(예전 select), primary 전폭 "점검 시작".
  - **점검 작성(InspectionEdit)**: 제목 + 유형·상태(저장 시각 mono ok), 제출 완료 Banner ok + ghost "홈으로", 최종 의견 카드(label + textarea input), primary 전폭 제출.
  - **입주·퇴거 폼(BaselineInspectionForm)**: 이전 기록 카드(ghost 전폭 "이전 퇴거 기록 가져오기"), 구역 탭 가로 스크롤(선택 ink 바탕, 이상 n warn · ✓ 확인 ok, 스크롤바 숨김), 구역 제목 17px, 확인됨 Banner ok / ghost "한 번에 확인", 항목 카드(구분선, 이름 + 핵심 dark·일반 plain Pill + 이전 기록 뱃지, 상태 `SegmentedControl` — 옵션 `STATE_OPTIONS`), 수리 확인 항목 `bg-warn-soft ring-warn`, "수리 확인 완료" warn 테두리 버튼, 메모 input, 사진 필수 문구(없으면 crit). 요약은 sticky를 풀고 카드로: **구역 확인 격자**(`data-test="zone-grid"`, 4열, 확인 ok · 이상 기록 warn · 나머지 plain) + mono 요약 줄 + primary sm "저장" + 이전 기록 요약(seal)·미확인 구역·사진 필요(crit).
  - **색**: `carryoverView.carryoverBadge().class` 수리 확인 대기 `bg-warn-soft text-warn` · 이어받음 `bg-seal-soft text-seal`. `reportView.gradeClass`는 `uiTones.GRADE_TONE`(미지정 `bg-surface-2 text-ink-2`), `stateTone(code)` 추가(정상 ok · 경미 acc · 손상 warn · 파손 crit · 주의/추가 확인 warn · 수리 필요/긴급 crit).
  - **정기·긴급·수리 폼**: 공간/문제 항목 AppCard, 입력 토큰(`rounded-[10px] border-line`), 정기 상태 버튼 정상 ok · 주의 warn · 수리 필요 crit, 긴급 심각도 칩(선택 ink), 현장 확인 surface-2 상자, 저장은 아래 고정 흰 띠 + primary 전폭. **PhotoUploader**: 카드, ghost sm "파일 선택"(label), 사진 **3열 4:3**, 유형·설명 작은 input. **AiGuidePanel**: eyebrow 제목, ghost sm 호출, fallback Banner warn, 초안 quote.
  - **리포트 목록(ReportListCards)**: 한 열 카드 — 호실(한 줄 말줄임) + GradeChip, "유형 · 리포트 #id · 날짜(mono)" + 확인 Pill(확인 완료 ok · 미확인 plain). **OwnerReports**: ghost 전폭 "리포트 비교", 계약 링크 ghost sm, 필터 select 3개 → 칩 3줄(전체 호실/유형/확인 상태 전체가 첫 칩, 필터 값·`?unit=` 그대로). **TenantReports**는 제목·House Log 링크·목록 부분만(확인할 계약 카드는 예전 색 그대로).
  - **리포트 상세·공유(ReportSnapshotView)**: 상단 요약(18px 호실, 유형 · mono 발행 시각, "D등급" 칩 + "시공업자 · 임대인 · 임차인" 한 줄), **공간별 카드**(`category`로 묶음, 이름 · 위치 — 설명 + 상태 Pill), 현장 확인 카드, 사진 2열 4:3, AI 요약 카드, 최종 의견 카드, 고지. ReportDetail: ghost sm 확인 완료·공유 링크·PDF, 임대인 입주 리포트면 seal sm "입주 제보 승인", IntegrityBadge(sealbox), 겉 카드 없앰. SharedReport 같은 방식. 비교 비 baseline 조합은 겉 AppCard 대신 구분선.
  - **인쇄(PrintableReport)**: ReportSnapshotView가 카드가 되어서 예전 스냅샷 마크업을 PrintableReport 안에 그대로 옮겼다(레이아웃 그대로, 날짜·등급만 mono, 등급 칩 색은 gradeClass 새 토큰).
  - `시연가이드.md`: 점검 폼 장면 "유형 칩·호실 칩", 요약 카드의 구역 칸, 가져오기 상자 "파란 상자" → "상자". 순서·문구·값은 그대로.
- 수정 파일: `frontend/src/components/ui/Chip.vue`(새), `src/components/BaselineInspectionForm.vue`·`WholeInspectionForm.vue`·`IssueInspectionForm.vue`·`PhotoUploader.vue`·`AiGuidePanel.vue`·`ReportListCards.vue`·`ReportSnapshotView.vue`, `src/views/ContractorHome.vue`·`NewInspection.vue`·`InspectionEdit.vue`·`OwnerReports.vue`·`TenantReports.vue`·`ReportDetail.vue`·`SharedReport.vue`·`PrintableReport.vue`·`ReportCompareView.vue`(겉 카드만), `src/lib/carryoverView.js`·`reportView.js`, `test/carryoverView.test.js`(`bg-yellow-50` → `bg-warn-soft`)·`reportView.test.js`(기대 클래스 + stateTone)·`ui.test.js`(Chip), `시연가이드.md`
- 테스트: frontend `npm test` 154개 통과(20 파일), `vite build` 통과. 백엔드 안 건드림.
- 화면 확인: 스크래치 DB(`DB_FILE`)로 백엔드를 띄우고(이미 떠 있던 5173 Vite 사용) 430px 헤드리스 크롬 — 시공업자 홈, 새 점검, 입주 폼(가져오기 뒤 · 거실 탭), 정기·긴급 폼, 임대인 리포트 목록, 리포트 #5·#1 상세, 공유 리포트, 인쇄, 임차인 목록. 가로 넘침 없음(scrollWidth ≤ 430). 앱 `app.db`는 건드리지 않음.
- 다음 창 주의: 아직 예전 slate/amber 색인 화면 — `TenantReports`의 "확인할 계약" 카드, `TenantBaselineActions`·`TenantReportReview`(구역 `sm:grid-cols-4`), `LeaseForm`·`LeaseList`, `HouseLog`, `EvidencePackage`(인쇄용, 넓은 화면). `PrintableReport`는 일부러 예전 레이아웃(slate)이다. 수리 확인 노란 표시는 합의 확정 뒤에만 나오므로 기본 시드 스크린샷에는 안 보인다(테스트로 확인).

### 창 22 · 퇴거 정산 화면 목업 디자인 — 완료 (2026-09-28)
- 한 일: 목업 compare · worksheet · formula · t-settle · settle-status · ledger · report(해시 뱃지)를 창 21 토큰·`components/ui/`로 입혔다. 계산·부담자 규칙·확정 조건·문구·`data-test`·API는 그대로.
  - **색 매핑** (`uiTones.PILL_TONE`을 씀, 목업 ST·EVID와 같게): `diffView.stateBadge` 정상 ok · 경미 acc · 손상 warn · 파손 crit · 기록 없음 plain, `evidenceBadge` 높음 acc · 보통 warn · 낮음 plain. 두 함수 결과에 `tone`을 더했다(`<Pill :tone>`용, `class`도 유지 — TenantBaselineActions 등 기존 사용처 그대로). `settlementShareView.responseBadge` 동의 ok · 이의 crit · 대기 plain(+`tone`), `repairLedgerView.reasonClass` 자연 마모 ok · 소액 일괄 seal · 이의 후 warn · 임대인 선택 plain, `reportView.integrityBadge` 정상 `border-seal bg-seal-soft text-seal` · 변경 감지 `border-crit bg-crit-soft text-crit`.
  - **공통 컴포넌트 확장**: `AppButton` `variant="seal"`(목업 .btn.seal, "임대인 부담으로 돌리기"), `SegmentedControl` 옵션 `test` → 버튼 `data-test`(기존 `payer-*`·`choose-*` 유지용).
  - **IntegrityBadge** (목업 sealbox): 정상 = seal 1.5px 테두리 박스 + 자물쇠 SVG, "SHA-256 앞4…뒤4" 부분만 mono(문구 한 글자도 안 바꿈), 변경 감지 = crit 박스 + 경고 SVG. 리포트 상세·리포트 공유·정산·정산 공유 모두 같은 컴포넌트.
  - **비교**: 리포트 선택을 위아래로 쌓고("vs" 유지) ghost "비교". 요약 카드(mono 날짜 + "같은 호실" Pill + crit "변경 n"), 변경 카드(구역 muted · 이름 · 핵심 dark/일반 plain Pill · 청구 가능성 Pill, "입주 정상 → 퇴거 손상" Pill, 사진 2칸 4:3 · 없으면 점선 칸 + 안내), 변경 없는 항목 `<details>`, primary "보증금 공제 근거 만들기". 비 baseline 조합은 AppCard 두 장 위아래 + 수리 전/후 안내 Banner seal.
  - **보증금 공제 근거**: 요약 카드, 보류/확정 배너(Banner crit/ok, 확정이면 바로 아래 IntegrityBadge — 둘을 `data-test="status-banner"` div로 묶음), 증빙 자료 카드(보류면 crit 테두리 + crit 버튼), 소액 일괄 ghost 전폭, 항목 카드(부담자 SegmentedControl, 견적 mono 입력, 금액 박스: 임차인 금액 mono · 특약 기준은 글자 + 특약 원문 quote(정산 계약의 `lease.clauses[].text`, 임차인 부담일 때) · 표준 기준은 mono · 참고 mono), 임차인 응답(Pill + mono 시각 + quote, 이의면 crit-soft 바탕 + seal 버튼), 청소비 카드, 수동 확인 Banner warn, 합계 박스(임차인 청구 19px mono · 반환 예정 16px · 임대인 부담), 링크 카드(모의 알림 Banner warn), 합의 확정 primary 전폭 + 사유.
  - **계산 근거 바텀시트** (목업 formula): 임차인 부담이고 `basis`가 있는 항목에 "계산 근거 보기 ›"(`data-test="open-basis"`) → `Teleport` 바텀시트(`data-test="basis-sheet"`, 430px, 바깥 클릭·Esc·"닫기"로 닫힘). 내용은 카드에 있는 것 그대로(청구 가능성·상태 Pill, 적용 기준 · 특약 원문 · 금액, 공식 문장 "잔존가치 = 1 − 경과 월수 ÷ (내구연수 × 12)" + 경과 개월 · 백엔드 `lifespanYears` · 백엔드 `basis.residual` · 참고 금액, 고지). 새 계산 없음.
  - **임차인 정산 링크**: 앱 바 아래 주소창 느낌 상단(`data-test="urlbar"`, 자물쇠 + `host/share/settlement/토큰 앞 8자…`, "로그인 없이 링크로 열람 중" + 임차인 Pill warn), 항목 카드 + 동의/이의 SegmentedControl, 이의 textarea, primary "응답 남기기", 응답 기록 Pill + mono "기록 · 수정 불가", 확정이면 Banner ok + IntegrityBadge(둘을 `data-test="confirmed-notice"` div로 묶음 — 기존 테스트 구조 유지), 보류 Banner crit.
  - **수선비 장부**: 부제, ghost CSV 전폭, 세무사 고지 Banner warn, 연도·호실 2열 select, 표(카드 안 가로 스크롤, 12px, 금액·날짜·정산 번호 mono, 금액 오른쪽 정렬, 합계 굵게), 호실별·연도별 합계 한 카드, 예정 카드.
  - `시연가이드.md`: 비교 리포트 선택 "왼쪽/오른쪽" → "위 칸/아래 칸", 동결 뱃지 "초록" → "파란 테두리 상자(자물쇠)", 확정 뱃지 위치 "배너 안" → "배너 바로 아래", 변경 감지 "빨간 테두리 상자", 합의 확정 안내 "버튼 옆" → "버튼 아래". 순서·문구·값은 그대로.
- 수정 파일: `frontend/src/lib/diffView.js`·`settlementShareView.js`·`repairLedgerView.js`·`reportView.js`(색 클래스 + tone), `src/components/DiffView.vue`·`IntegrityBadge.vue`·`ui/AppButton.vue`·`ui/SegmentedControl.vue`, `src/views/ReportCompareView.vue`·`SettlementView.vue`·`SharedSettlement.vue`·`RepairLedger.vue`, `test/diffView.test.js`·`repairLedgerView.test.js`·`reportView.test.js`(기대 클래스만), `test/ui.test.js`(seal·data-test·IntegrityBadge 2개 추가), `시연가이드.md`
- 테스트: frontend `npm test` 152개 통과(20 파일), `vite build` 통과. 백엔드 안 건드림.
- 화면 확인: 임시 DB(`DB_FILE`=스크래치)로 서버를 띄워 430px 헤드리스 크롬 스크린샷 — 비교(입주↔퇴거, 정기↔정기) · 정산(초기 770,000 / 49,230,000 / 60,000, 소액 일괄 뒤 105,000) · 바텀시트 · 임차인 링크(이의 입력) · 보류 · 확정(정산서 동결 상자) · 임차인 확정 화면 · 수선비 장부(585,000원) · 리포트 상세. 가로 넘침 없음(scrollWidth 415 < 430). 앱 `app.db`는 건드리지 않음.
- 다음 창 주의: 리포트 상세(`ReportDetail`/`ReportSnapshotView`)는 뱃지만 바뀌고 나머지는 예전 slate 색(창 21 목록의 사진 3열 문제 그대로). 비교의 비 baseline 조합도 안쪽 `ReportSnapshotView`는 예전 색. `TenantBaselineActions`·`TenantReportReview`·증빙 패키지는 `stateBadge().class`를 그대로 쓰므로 새 토큰 색이 이미 들어갔다. `Banner tone="plain"`은 바탕(surface-2)과 같은 색이라 테두리 없이 글자만 보인다(목업도 같음).

### 창 21 · 디자인 토큰과 앱 틀, 임대인 홈 — 완료 (2026-09-28)
- 한 일:
  - **디자인 토큰** (`frontend/src/style.css` `@theme`, 목업 `:root` 라이트 값 그대로):
    - 색 `--color-*`: `ground` `panel` `surface` `surface-2` `ink` `ink-2` `ink-3` `line` `accent` `accent-soft` `accent-ink` `seal` `seal-soft` `ok` `ok-soft` `warn` `warn-soft` `crit` `crit-soft` → `bg-ground`, `text-ink-2`, `border-line`, `bg-crit-soft`, `border-l-crit` …
    - 글꼴: `font-sans` = IBM Plex Sans KR → "Malgun Gothic" → system-ui, `font-mono` = IBM Plex Mono → ui-monospace → Consolas. `index.html`에 Google Fonts 링크(끊겨도 대체 글꼴). 금액·날짜·해시·D-day는 `.num` 유틸리티(mono + tabular-nums).
    - 모서리: `rounded-card`(14px) · `rounded-btn`(12px) · `rounded-chip`(99px). 본문 14px / 1.5, 포커스 링 accent 2px(`:focus-visible`). 인쇄 시 배경 흰색.
  - **색 클래스 표** `frontend/src/lib/uiTones.js`: `DDAY_TONE`(crit·warn·calm), `PILL_TONE`(ok·warn·crit·seal·acc·plain·dark), `EDGE_TONE`, `GRADE_TONE`(A~E), `BANNER_TONE`/`BANNER_STRONG`. 컴포넌트와 `ownerHome.js`가 같이 쓴다(색 문자열 한 곳).
  - **공통 컴포넌트** `frontend/src/components/ui/` (props만, API 호출 없음):
    - `AppCard` (`as`, `tap`, `edge`=crit·warn·calm) · `Pill` (`tone`) · `DdayChip` (`severity`, mono) · `GradeChip` (`grade` A~E)
    - `AppButton` (`as`, `variant`=primary·ghost, `sm`; `as`에 RouterLink를 주면 링크) · `Banner` (`tone`=crit·ok·warn·seal·plain, `<b>`는 배너 색)
    - `SegmentedControl` (`options`, v-model) · `AppBar` (`title`, `back`→`back` 이벤트, `meta`, 슬롯 `title`/`right`) · `BottomTabBar` (`items`=[{label,to,icon:home·report·ledger,active}], 목업 아이콘)
  - **앱 틀** (`App.vue`): 바탕 ground, 가운데 단 최대 430px(surface-2, 좌우 16px). 라우트 `meta.wide`(인쇄 `/reports/:id/print`, 증빙 `/owner/settlements/:id/evidence`)는 예전처럼 `max-w-4xl`. 위 앱 바(서비스 이름 · 사용자 이름·역할 · "사용자 변경"), 공유 링크 화면은 사용자 표시 없음(urlbar는 안 만듦). 임대인은 위 내비 대신 **하단 탭바**(`OWNER_NAV`·`isNavActive` 그대로, `data-test="owner-nav"`는 탭바로), 탭바가 있을 때 main 아래 여백 `pb-24`. 시공업자·임차인은 탭바 없음.
  - **화면**: `RoleUserSelector`(카드 + 역할 Pill: 시공업자 seal · 임대인 acc · 임차인 warn), `OwnerHome`(목업 home: 날짜 muted + 건수 h + ghost "수선비 장부", 할 일 = 왼쪽 색 테두리 누르는 카드 + DdayChip, 호실 현황 2열 카드 + Pill + sm ghost 버튼). 문구·링크·`data-test` 그대로.
  - `ownerHome.js`: `ddayChip().class`·`cardBorderClass`·`leaseStatusBadge().class`를 토큰 클래스로, `leaseStatusBadge`에 `tone` 추가(none·ended plain / upcoming seal / active ok / ending warn).
- 수정 파일: `frontend/index.html`, `src/style.css`, `src/App.vue`, `src/router/index.js`(meta.wide만), `src/lib/uiTones.js`(새), `src/lib/ownerHome.js`, `src/components/ui/*.vue`(새 9개), `src/views/OwnerHome.vue`, `src/views/RoleUserSelector.vue`, `test/ui.test.js`(새), `test/ownerHome.test.js`(기대 클래스만)
- 테스트: frontend `npm test` 150개 통과(20 파일, 새 `ui.test.js` 10개), `vite build` 통과. 백엔드 안 건드림.
- 화면 확인: 크롬 1280px로 16개 화면 스크린샷(시연 DB). 가로 넘침(main 밖으로 나가는 요소)은 0개.
- **폭 430px에서 어색한 화면 (다음 창에서 고칠 것)** — 가로 스크롤은 없지만 `sm:`/`lg:` 반응형이 브라우저 폭 기준이라 좁은 단에서도 여러 열이 된다:
  - `ReportDetail`/`ReportSnapshotView`(리포트 상세·임차인 리포트): 사진 `sm:grid-cols-3`이라 사진 안 글자가 잘림, 참여자 3열 줄이 빠듯함.
  - `ReportCompareView`: 리포트 선택 두 개 + "vs" + "비교" 버튼이 줄바꿈되어 들쭉날쭉.
  - `OwnerReports`/`ReportListCards`: 카드 `sm:grid-cols-2`라 "노원 그린아파트 1234호"가 두 줄로 끊김.
  - `SettlementView`: 동작은 되나 "분쟁 대비 증빙 자료" 줄 설명이 좁음, 예전 slate 색.
  - `TenantReportReview`·`TenantBaselineActions`: 구역 `sm:grid-cols-4` — 지금은 들어가지만 빠듯함.
  - `NewInspection`(유형 `lg:grid-cols-3`), `LeaseForm`·`IssueInspectionForm`·`WholeInspectionForm`·`AiGuidePanel`·`PhotoUploader`(`sm:grid-cols-2`): 들어가지만 입력칸이 좁음.
  - `RepairLedger`: 표(`<table>`)는 확정 항목이 있을 때 좁을 수 있음(시드 기본 상태는 확정 항목 없음이라 미확인).
  - 나머지 화면은 모두 예전 slate/blue 색이라 새 토큰과 섞여 보인다(창 22~24에서 교체).
- 다음 창 주의: 색은 `uiTones.js`·토큰 클래스만 쓴다. 인쇄·증빙은 `meta.wide`. 탭바가 `fixed`라 풀페이지 스크린샷에서는 화면 가운데에 찍힌다(실제 화면은 정상).

### 창 20 · 다음 입주 기준선 가져오기 — 완료 (2026-09-27)
- 한 일: 설계 원칙 "퇴거 리포트가 다음 입주의 기준선이 된다". AI 없음, 공제·책임 판단 없음. 제보 기간·diff 규칙, 기존 입주 리포트는 건드리지 않았다.
  - 순수 로직 `backend/src/lib/carryover.js`:
    - `buildCarryover({ sourceReport, moveOutSnapshot, settlement })` → `{ sourceReportId, sourceDate, settlementId, items: [{ itemCode, zone, name, tier, state, description, inSettlement, settlementStatus, payer, suggestedState, needsRepairCheck, reason, moveOutImages: [{ caption, data_base64 }] }] }`(카탈로그 순).
      - 대상: 퇴거 스냅샷 `items` 중 카탈로그 코드가 있고 state ≠ normal.
      - **확정** 정산에 든 항목(부담자 무관) → `suggestedState 'normal'`, `needsRepairCheck: true`, `REASON_REPAIR_CHECK` "퇴거 정산 항목 · 수리 확인 필요".
      - 정산 없음 / 정산에 없는 항목 / 확정 전(draft·hold) → 퇴거 상태 그대로, `REASON_INHERIT` "이전 퇴거 상태 이어받음".
    - `latestMoveOutReport(reports)`(퇴거 전/후 중 created_at → id 최신), `normalizeCarryoverInput`(null = 지우기, 카탈로그 코드 검증·중복 제거, reason 100자, `400 INVALID_CARRYOVER`), `assertCarryoverTarget`(입주 전 점검만 `CARRYOVER_NOT_MOVE_IN`, 같은 호실 퇴거 리포트만 `INVALID_CARRYOVER`).
  - API `GET /api/units/:id/baseline-carryover` (`routes/carryover.js`, api.js 등록): 헤더 없음 401, 없는 호실 404, 시공업자(모든 호실 점검 주체 — `getAccessibleUnits`와 같음) 또는 그 호실 owner만(임차인·다른 owner 403), 퇴거 리포트 없음 `404 NO_PREVIOUS_MOVE_OUT`. 정산 = 그 퇴거 리포트의 최근 정산, 확정이면 동결 스냅샷 항목(재계산 안 함), 아니면 `settlement_items`.
  - 저장: `inspections.carryover_json TEXT`(스키마 변경 → `npm run db:init` 재실행 완료). `PATCH /api/inspections/:id`에 `carryover: { sourceReportId, items: [{ itemCode, reason, repairCheckPending }] } | null`. `getInspectionById`는 `carryover`(파싱)로 돌려주고 `carryover_json`은 뺀다.
  - 스냅샷: `buildSnapshot`이 `inspection.carryover`가 있을 때만 맨 끝에 `carryover` 키 추가(없으면 키 없음 → 기존·시드 스냅샷 모양 그대로). 해시는 기존대로 제출 때 계산.
  - House Log: 종류 `carryover`를 `report` 바로 뒤에 추가(`HOUSE_LOG_KINDS` 10가지). 스냅샷에 carryover가 있는 리포트마다 같은 시각 "이전 퇴거 기록 이어받음" · "퇴거 리포트 #5에서 4개 가져옴 · 수리 확인 4개[ · 현장 확인 전 제출 n개]", 링크 = 원본 퇴거 리포트, 계약 묶음은 그 리포트와 같다. 프론트 `KIND_META.carryover`(↪️, 점검 필터).
  - 프론트:
    - `lib/carryoverView.js`: `canCarryOver`(type `move_in`), `applyCarryover`(가져온 항목만 제안 상태로, 이상이면 퇴거 메모를 메모 칸에, 정상이면 사진·메모 비움 — `setItemState` 규칙으로 이상 항목 구역은 확인이 풀리고 구역 확인은 가져오지 않음), `fromSavedCarryover`, `clearRepairCheck`, `afterStateChange`(수리 확인 항목을 **이상으로** 바꾸면 표시 해제, 정상 클릭은 유지), `carryoverBadge`, `pendingRepairChecks`, `carryoverSummary`("이전 기록에서 n개 가져옴 · 수리 확인 n개" / "· 수리 확인 모두 완료"), `submitWarning`, `carryoverPayload`, `previewImages`.
    - `BaselineInspectionForm.vue`: props `carryoverEnabled`·`carryoverSource`·`carryoverLoading`·`carryoverMessage`, emit `request-carryover`, expose `applyCarryoverSource`·`getSubmitWarning`. 위 파란 상자 + "이전 퇴거 기록 가져오기"(다시 가져오면 확인 창), 항목에 "이전 기록" 뱃지 + 사유, 퇴거 사진 미리보기(h-12), 수리 확인 항목은 노란 배경·테두리 + "수리 확인 완료" 버튼, 요약 줄 아래 carryover 요약. 가져오기·확인 완료는 바로 저장(PATCH).
    - `InspectionEdit.vue`: API 호출(가져오기, 이미 가져온 점검은 미리보기용으로 다시 조회 — 실패 무시), 이상 항목이 없으면 안내 문구, 404 문구 그대로 표시. 제출 때 수리 확인 표시가 남아 있으면 `window.confirm` 안내(확인 → 그대로 제출, 막지 않음).
  - 시연 데이터 확인(in-memory, "짧게" 순서로 확정 후): 가져오기 → 4개 모두 정상 + 수리 확인(벽지·실리콘 tenant, 후드 필터·방충망 landlord). 확정 전에는 4개 모두 퇴거 상태 그대로. 7개 구역 확인 후 제출 → 리포트 id 7, House Log 16 → 18건, 해시 검증 6/6. 오늘 할 일 목록은 제출 전과 같다.
- 수정 파일: `backend/src/lib/carryover.js`(신규), `backend/src/routes/carryover.js`(신규), `backend/src/routes/api.js`, `backend/src/routes/inspections.js`, `backend/src/repositories/inspectionRepo.js`, `backend/src/repositories/reportRepo.js`, `backend/src/db/schema.sql`, `backend/src/lib/houseLog.js`, `backend/test/carryover.test.js`(신규), `backend/test/houseLog.test.js`(시드 전 종류 목록에서 carryover 제외), `frontend/src/lib/carryoverView.js`(신규), `frontend/src/components/BaselineInspectionForm.vue`, `frontend/src/views/InspectionEdit.vue`, `frontend/src/lib/houseLogView.js`, `frontend/test/carryoverView.test.js`(신규), `시연가이드.md`(4장 선택 장면 + 7장 체크 1줄), `CLAUDE.md`(invariant 1줄, API surface).
- 테스트: backend `npm test -- carryover`(10: 순수 4 — 확정 전/후 제안 상태·정산 없음·최신 퇴거·입력 정리 / API 6 — 확정 전·후 1234호, 404 NO_PREVIOUS_MOVE_OUT·403·401·404, 다른 owner 403, 저장 → 제출 → 스냅샷 carryover·해시·House Log 이벤트·기존 입주 스냅샷 불변, 입주 전·같은 호실만 400) · frontend `npm test -- carryoverView`(7: 순수 5 + 폼 2 — 채우기·뱃지·노란 표시·확인 해제·저장 본문, 버튼 없음·다시 가져오기 확인 창). 전체 backend **295** · frontend **140** 통과, `vite build` 통과. 브라우저 화면은 사람이 확인.
- 다음 창 주의:
  - 가져오기 원본은 "호실의 가장 최근 퇴거 리포트"다. 퇴거 리포트를 새로 제출하면 원본이 바뀐다(저장된 carryover의 `sourceReportId`는 그대로).
  - 가져온 뒤 정산이 확정되면 제안이 달라진다. 폼은 다시 가져오기(확인 창)로만 갱신한다.
  - 수리 확인 표시는 zone 일괄 확인으로 지워지지 않는다(작성자가 항목마다 확인).

### 창 19 · 분쟁 대비 증빙 패키지 — 완료 (2026-09-27)
- 한 일: 새 테이블·새 기록 없이, 합의가 안 될 때 임대인이 조정기관 등에 낼 수 있는 한 묶음 자료를 만든다. 서버 PDF 생성·외부 전송·법적 판단 문구 없음(인쇄는 브라우저 `window.print()`).
  - 순수 조립 `backend/src/lib/evidencePackage.js` `buildEvidencePackage({ settlement, frozen, lease, moveInSnapshot, moveOutSnapshot, tenantZoneConfirmations, tenantReports, changes, zones, link, integrity, now })` →
    `{ generatedAt, notice, settlement: { id, status, frozen, confirmedAt, moveInDate, moveOutDate, elapsedMonths }, unit: { id, name, building, address }, lease: { id, range, startDate, endDate, deposit, monthlyRent, tenantName, tenantConfirmedAt, clauses: [{ clauseNo, title, text, applyMode, applyLabel(자동 적용/수동 확인 필요/표시만), tenantConfirmedAt }] } | null, baseline: { reportId, date, grade, contractor, zoneConfirmations: [{ zone, author, tenant, tenantConfirmedAt }](ZONES 순), approvedTenantReports, rejectedTenantReports, pendingTenantReportCount }, moveOut: { reportId, date, grade, typeLabel }, items: [{ itemCode, zone, name, tier, from, to, evidence, payer, estimateCost, amount(부담자 기준 금액), basis: { type: clause|standard|none, clauseNo, title, text(특약 원문), formula(계산식 문장) }, moveInImages, moveOutImages, tenantResponse: { response, text, image, respondedAt } | null }], fees, manualClauses, totals, link: { createdAt, firstViewedAt, expiresAt } | null(토큰은 넣지 않음), integrity: { moveIn, moveOut, settlement(확정 전 null), verifiedAt } }`.
    - `basisView`: 특약 → "계약 특약 제n항 적용 · 견적 전액 (참고: 표준 기준 n원)", 표준 → "표준 기준 · 견적 150,000원 × 잔존 60% (1 − 경과 24개월 ÷ (내구연수 5년 × 12)) = 90,000원", 임대인/보류 → 설명.
    - `zoneConfirmationTable(zones, confirmations)`: 입주 스냅샷 구역 확인 + 발행 뒤 임차인 구역 확인(스냅샷에 이미 있는 구역은 빼고 합침).
  - API `GET /api/settlements/:id/evidence` (`routes/settlements.js` `buildEvidence`): 없음 404, 헤더 없음 401, 그 호실 party가 아니면 403, **임차인도 403**(owner만). 정산 본문은 `settlementBody` 그대로 → 확정 뒤에는 동결 스냅샷(`frozen: true`, 재계산 안 함). 계약은 본문의 `leaseId`(없으면 입주 리포트 날짜 기준). 사진은 리포트 스냅샷 + 승인 제보(diff `moveInImages`/`moveOutImages`). 링크는 최근 링크. 무결성 = `verifyReportSnapshot` ×2 + `verifySettlementSnapshot`.
  - 프론트:
    - 라우트 `/owner/settlements/:id/evidence`(`owner-settlement-evidence`) → `EvidencePackage.vue`: 표지(호실·계약 기간·점검 기간·정산 상태·생성 시각·해시 요약 + 해시 앞4…뒤4) → 1. 계약과 특약(원문·적용·임차인 확인 시각) → 2. 입주 기준선(구역 표, 승인·거절 제보, 대기 건수) → 3. 항목별 비교와 청구 근거(입주·퇴거 사진 나란히, 특약 원문 인용 + 계산식, 고정 금액 특약, 수동 확인 특약, 합계) → 4. 임차인 응답 이력(링크 생성·최초 열람·만료, 응답 시각 순, 이의 내용·사진) → 5. 무결성 검증(저장·현재 해시 전체, 검증 시각) → 고지.
    - 인쇄: "인쇄 / PDF 저장"(window.print), 버튼 줄 `print:hidden`(내비는 App.vue가 이미 숨김), scoped `@media print`로 `.avoid-break`(항목 카드·표·응답) `break-inside: avoid`, 제목 뒤 끊김 방지, 표지 뒤 페이지 나눔.
    - `lib/evidenceView.js`: `EVIDENCE_NOTICES`(법률 자문 아님 · 판단은 조정기관·법원 · 해시는 사실 여부 보증 아님), `evidencePath`, `evidenceButton`(보류면 `emphasized`), `formatStamp`(SQLite 시각은 UTC로), `integrityRows`(ok/fail/none), `integritySummary`, `coverView`, `zoneRow`, `tenantReportRow`, `itemCardView`, `responseRows`, `linkLines`, `totalsRows`, `payerLabel`, `statusLabel`.
    - `SettlementView.vue`: 상태 배너 아래 "📁 분쟁 대비 증빙 자료" 링크 카드(임대인만). 보류면 빨간 테두리·빨간 버튼 + 안내 문구.
- 수정 파일: `backend/src/lib/evidencePackage.js`(신규), `backend/src/routes/settlements.js`, `backend/test/evidencePackage.test.js`(신규), `frontend/src/lib/evidenceView.js`(신규), `frontend/src/views/EvidencePackage.vue`(신규), `frontend/src/router/index.js`, `frontend/src/views/SettlementView.vue`, `frontend/test/evidenceView.test.js`(신규), `시연가이드.md`(3단계 4번 아래 선택 장면, 7장 체크 1줄), `CLAUDE.md`(API surface).
- 테스트: backend `npm test -- evidencePackage`(8: 순수 3 — 계산식 문장·구역 표·조립 / API 5 — 확정 전 draft, 보류(이의 내용·사진·시각·링크 열람), 확정 후 스냅샷 기준 770,000/105,000/49,230,000 + 정산서 변조 ok=false, 리포트 변조 ok=false, 권한 임차인·시공업자 403·401·404) · frontend `npm test -- evidenceView`(6: 순수 5 + 화면 1). 전체 backend **285** · frontend **133** 통과, `vite build` 통과. 브라우저 인쇄 미리보기는 사람이 확인.
- 다음 창 주의:
  - 증빙 자료는 읽기 전용이라 House Log 이벤트를 만들지 않았다(열람 기록 없음). 필요하면 "증빙 생성" 이벤트를 `HOUSE_LOG_KINDS`에 추가.
  - 확정 뒤에도 계약·특약 원문(1장)과 입주 제보(2장)는 지금 DB 값이다. 청구 근거 특약 원문(3장 `basis.text`)은 정산서 스냅샷 값.

### 창 18 · House Log 타임라인 — 완료 (2026-09-27)
- 한 일: 새 테이블·새 데이터 없이 이미 있는 기록을 모아 호실 하나의 시간순 타임라인을 만든다. 기존 API 응답 형식은 그대로.
  - 순수 로직 `backend/src/lib/houseLog.js`:
    - `buildHouseLog({ unit, leases, reports, verifies, tenantReports, settlements, ledgerRows, now, viewer })` → `{ unit: { id, name }, leases: [{ id, range, startDate, endDate, tenantName, tenantUserId }](시작일 순), events }`.
    - 이벤트 `{ at(ISO UTC), kind, title, detail, actor, link, integrity: { ok, shortHash(저장 해시 앞 8자) } | null, leaseId }`.
    - **이벤트 종류 9가지** (`HOUSE_LOG_KINDS`):
      | kind | 시각 | 제목 · detail |
      |---|---|---|
      | `lease_start` | 계약 시작일 현지 자정 | 계약 시작 · 기간 · 보증금 · 특약 n건 |
      | `clauses_confirmed` | 계약의 `tenantConfirmedAt`(특약 모두 확인했을 때만) | 임차인 특약 확인 · 특약 n건 모두 확인 |
      | `lease_end` | 종료일 23:59:59 — **종료일이 오늘(now) 이하일 때만** | 계약 종료 |
      | `report` | `reports.created_at` | "{유형} 리포트 발행" · 등급 · 이상 n건(스냅샷 items 중 state ≠ normal), integrity = 리포트 해시 검증 |
      | `tenant_report` | 제보 `created_at` | 입주 제보 · 항목 · 상태 · 내용 · 승인/거절/대기 |
      | `settlement_link` | 링크 `created_at` / `first_viewed_at` | 임차인 정산 링크 생성(만료일) / 최초 열람 — 링크 전부 |
      | `tenant_response` | `tenantRespondedAt` | 임차인 동의/이의 · 항목 · 이의 문구(없으면 구역·청구액) |
      | `settlement_confirmed` | `confirmedAt` | 정산 합의 확정 · 임차인 청구 · 반환, integrity = 정산서 해시 검증 |
      | `ledger` | 그 정산의 `confirmedAt` | 수선비 장부 반영 · 항목 · 금액 · 사유 (lib/repairLedger rows) |
    - 정렬: `at` 오름차순, 같은 시각이면 위 표의 `HOUSE_LOG_KINDS` 순서(계약 시작 먼저, 확정 → 장부, 계약 종료 마지막).
    - 시각 정규화 `toIso`: 'YYYY-MM-DD' → 현지 자정, SQLite 'YYYY-MM-DD HH:MM:SS' → UTC, ISO 그대로.
    - 계약 묶음 `leaseIdForDate`(leaseRepo.getLeaseForDate와 같은 규칙: 기간 안 → 가장 가까운 이전 계약 → 가장 이른 이후 계약). 계약 이벤트는 자기 계약, 리포트는 발행일, **입주 제보는 그 입주 리포트의 계약**, **정산 이벤트(링크·응답·확정·장부)는 정산 본문의 `leaseId`**(입주 리포트 날짜 기준, 창 12) — 새 계약을 등록해도 옛 정산 이벤트가 옮겨 가지 않는다.
    - 링크(viewer별): owner → 계약 이력 / `/owner/reports/:id` / 제보 승인 화면 / `/owner/settlement?moveInReportId&moveOutReportId` / `/owner/repair-ledger`. tenant → 계약 이벤트 `/tenant/reports`(특약 확인 카드), 리포트·제보 `/tenant/reports/:id`, 정산 이벤트 `null`(임차인 정산 화면은 링크 토큰뿐이라 열람 기록을 건드리지 않게).
    - `filterHouseLogForTenant(log, tenantUserId)`: 본인 계약만 + 그 계약에 묶인 이벤트만, **`ledger` 제외**, leaseId null 제외.
  - API `GET /api/units/:id/house-log` (`routes/houseLog.js`, api.js에 등록): 헤더 없음 401, 없는 호실 404, 그 호실 owner/tenant 아니면(시공업자 포함) 403. 확정 정산은 스냅샷 그대로(재계산 안 함), 아니면 `computeSettlementBody`. 장부 행은 `buildRepairLedger({ confirmed, filter: { unitId } }).rows`. repo 추가: `settlementRepo.listSettlementShareLinks`(정산의 링크 전부, 읽기 전용).
  - 프론트:
    - 라우트 `/owner/units/:id/house-log`, `/tenant/units/:id/house-log` → `HouseLog.vue`.
    - `lib/houseLogView.js`: `KIND_META`(아이콘·점 색·그룹), `FILTERS`(전체/점검/정산/계약 — 점검 = report·tenant_report, 정산 = link·response·confirmed·ledger, 계약 = start·clauses·end), `filterEvents`, `leaseSections`(계약별 구획 "기간 · 임차인 이름", 필터 중 빈 구획 숨김, 계약 없는 이벤트는 "계약 없음"), `integritySummary`("🔒 모든 리포트·정산서 해시 검증 n/n 정상" / 하나라도 실패면 빨간 "⚠ 해시 검증 k/n 정상 · m건 변경 감지"), `integrityChip`, `eventDate`, `countText`, `houseLogPath`.
    - 링크 버튼: 임대인 홈 호실 카드(`unitLinks().houseLog`), 계약 이력 화면 상단, 임차인 리포트 목록 위 "{호실} House Log"(본인 호실별).
  - 시연 데이터 확인(1234호, "짧게" 순서로 확정 후): 이벤트 16건, 해시 검증 5/5(리포트 4 + 정산서 1), 박임차 화면 14건(장부 없음). 확정 전 시드 그대로면 계약 시작·특약 확인·계약 종료·리포트 4·입주 제보 2.
- 수정 파일: `backend/src/lib/houseLog.js`(신규), `backend/src/routes/houseLog.js`(신규), `backend/src/routes/api.js`, `backend/src/repositories/settlementRepo.js`, `backend/test/houseLog.test.js`(신규), `frontend/src/lib/houseLogView.js`(신규), `frontend/src/views/HouseLog.vue`(신규), `frontend/src/router/index.js`, `frontend/src/lib/ownerHome.js`, `frontend/src/views/OwnerHome.vue`, `frontend/src/views/LeaseList.vue`, `frontend/src/views/TenantReports.vue`, `frontend/test/houseLogView.test.js`(신규), `frontend/test/ownerHome.test.js`, `시연가이드.md`(3-2단계 House Log로 마무리 + 7장 체크 1줄), `CLAUDE.md`(API surface에 house-log).
- 테스트: `npm test -- houseLog`(9: 순수 4 + API 5 — 권한, 확정 전/링크·응답 후/확정 후 종류, 정산서 변조 → integrity false, 임차인 필터·새 계약 분리, 345호) · 프론트 `houseLogView`(7) · `ownerHome`(11) 통과. 전체 backend 277 · frontend 127 통과, `vite build` 통과.
- 다음 창 주의:
  - 창 19 증빙 패키지·창 20 carryover가 새 기록을 만들면 House Log 이벤트 종류를 `HOUSE_LOG_KINDS`·`KIND_META`에 함께 추가한다(창 20 "입주 스냅샷에 carryover 기록(House Log 이벤트)").
  - 리포트 `created_at`은 UTC 저장이라 한국 시간 0~9시 발행분은 House Log 날짜(브라우저 현지)와 리포트 화면 날짜(원문 문자열)가 하루 다를 수 있다.

### 창 17 · 시연 기준일 고정과 demo:reset — 완료 (2026-09-27)
- 한 일:
  - **시연 기준일** `lib/demoClock.js`: `parseDemoToday`(빈 값 → null, `YYYY-MM-DD` 실제 날짜만, 아니면 서버 시작 시 throw), `demoNow(demoToday, real)`(기준일 + 실제 시·분·초·ms, 없으면 real), `sqlDateTime`(datetime('now')와 같은 UTC 형식). `config.demoToday` + `serverNow()`.
  - `createApp(db, { now, demoToday })`: 기본 now = `demoNow(demoToday ?? config.demoToday)` → 모든 라우터에 전달(점검 제출·임차인 제보 승인/거절 라우터에도 새로 전달). `GET /api/health` → `{ status, service, today, demoToday }`.
  - `seed(db, { now = serverNow() })`: 345호 계약 시작 = 기준일 − 2일(기존), **기존 리포트 1~3의 발행 시각도 now**(전에는 datetime('now')). `db:init`·`demo:reset` 모두 `serverNow()`.
  - 기존 now 사용처 확인: 정산·리포트 공유 링크 만료, 입주 제보 기간, 오늘 할 일, 정산 확정 시각, 링크 첫 열람, 임차인 응답 시각, 특약 확인 시각 → 모두 deps.now 경유라 기준일을 따른다.
  - **SQL `datetime('now')` 기본값 목록**: 모든 테이블 `created_at`(users, buildings, units, unit_users, inspections, inspection_items/observations/images, ai_guides, reports, report_snapshots, share_links, leases, settlements, settlement_snapshots, tenant_reports), `inspections.updated_at`, `zone_confirmations.confirmed_at`, `report_confirmations.confirmed_at`, `tenant_reports.decided_at`(repo COALESCE), 시드 `createReport`의 COALESCE.
    - **now로 바꾼 곳(화면에 날짜가 보임)**: `reports.created_at`(리포트 화면 `generatedAt`·비교 화면 날짜·발행 시각, 제출 시 `submitInspection(db, id, at)`) + 같은 문장의 `inspections.updated_at`, `tenant_reports.created_at`·`decided_at`(제보 승인 화면), 시드 리포트 1~3.
    - 그대로 둔 곳: 나머지는 화면에 날짜가 안 나온다(구역 확인·리포트 확인·정산/계약/링크 생성 시각 등).
    - 저장 형식은 계속 UTC(`YYYY-MM-DD HH:MM:SS`) — 한국 시간 새벽 0~9시에 만든 리포트는 전날 날짜로 보인다(창 17 이전과 같은 동작).
  - `npm run demo:reset` (`scripts/reset.js` → `src/db/reset.js` `resetDemoDb(db, { now })`): 파일 삭제 없이 같은 DB에 한 트랜잭션으로 `applySchema`(DROP 후 CREATE) + `seed(now)`, `busy_timeout 5000`, `backend/.demo-tamper/` 삭제, 출력 `[demo:reset] 완료 · 기준일 2026-09-27 · reports 6`(DEMO_TODAY 없으면 "(실제 날짜)"). `db:init`도 `resetDemoDb` 재사용, 기준일 출력.
  - 프론트: `formatToday(serverToday, now)` — `/api/health`의 today 우선, 없거나 형식이 틀리면 브라우저 날짜. `OwnerHome.vue`가 todos·reports와 함께 health를 불러온다(실패 → 브라우저 날짜).
  - `.env.example`에 `DEMO_TODAY` 설명, 로컬 `backend/.env`에 `DEMO_TODAY=2026-09-27` 설정. `backend/vitest.config.js`: 테스트는 `DEMO_TODAY=''`로 고정(.env 값과 무관).
  - **켜진 서버에서 확인**(백엔드를 켜 둔 채, 2026-09-27 01:04): 소액 일괄(임차인 680,000) + `demo:tamper -- 5`(verify ok:false, 백업 report-5.json) → `npm run demo:reset` → 서버 재시작 없이 API 재조회: 홈 할 일 4건(345호 D-5 · D-28), 정산 1 draft · 임차인 770,000 · 반환 49,230,000, 리포트 5 verify ok:true, 리포트 6개, `.demo-tamper` 없음, health `today 2026-09-27 · demoToday true`. 브라우저 화면은 이 API 값을 그대로 보여 준다(브라우저로 직접 새로고침은 하지 않음). 서버를 끈 상태의 `db:init`·`demo:reset`도 정상.
- 수정 파일: `backend/src/lib/demoClock.js`(신규), `backend/src/db/reset.js`(신규), `backend/scripts/reset.js`(신규), `backend/vitest.config.js`(신규), `backend/src/config.js`, `backend/src/app.js`, `backend/src/routes/api.js`, `backend/src/routes/inspections.js`, `backend/src/routes/tenantReports.js`, `backend/src/repositories/reportRepo.js`, `backend/src/db/seed.js`, `backend/src/db/init.js`, `backend/package.json`, `backend/.env.example`, `backend/test/demoClock.test.js`(신규), `frontend/src/lib/ownerHome.js`, `frontend/src/views/OwnerHome.vue`, `frontend/test/ownerHome.test.js`, `시연가이드.md`(0장 시드 설명, 2장 2-1 기준일·2-2 demo:reset, 5장, 6장 EPERM·날짜 줄, 4장 초기화 안내, 7장 체크리스트), `CLAUDE.md`(Commands).
- 테스트: `npm test -- demoClock`(9) · 프론트 `npm test -- ownerHome`(11) 통과. 전체 backend 268 · frontend 120 통과, `vite build` 통과.
- 다음 창 주의:
  - 새 기능에서 "지금"이 필요하면 `deps.now`(라우터) / `serverNow()`(스크립트)를 쓴다. `new Date()`·SQL `datetime('now')`를 새로 쓰지 않는다.
  - `DEMO_TODAY`를 바꾸면 서버 재시작 + `demo:reset`. 시연 기준 값(770,000 / 105,000 / 49,230,000)은 그대로.

### 창 16 · 수선비 장부와 CSV — 완료 (2026-09-27)
- 한 일:
  - **사유 판단용 필드**: `settlement_items.payer_source TEXT`(NULL 기본 부담자 / `bulk_small` 소액 일괄 / `manual` 임대인이 PATCH로 부담자를 바꿈 — 같은 값이면 기록 안 함). `listSettlementItems`가 `payerSource`를 돌려주고 `computeSettlementBody`가 항목마다 `payerSource`를 넣어 **확정 스냅샷에 동결**된다(창 15 스냅샷 필드 추가). 스키마 변경 → `npm run db:init` 재실행 완료.
  - 순수 로직 `lib/repairLedger.js`: `ledgerReason`(순서: 임차인 이의 → "이의 후 임대인 부담" / `bulk_small` → "소액 일괄" / `payerSource` 없음 + `defaultPayer === 'landlord'` → "자연 마모 후보" / 그 외 "임대인 선택". `payerSource` 필드가 없는 옛 스냅샷도 같은 규칙), `ledgerDate`(확정 시각 → 서버 현지 날짜, 할 일과 같은 `toDateString`), `buildRepairLedger({ confirmed, drafts, filter })` → `{ rows, pending, totals, years }`, `ledgerTotals`(byUnit 호실 이름순 · byYear 연도순, 각 `{ total, count }`), `toCsv`, `csvCell`, `parseLedgerFilter`.
    - 행: `{ date, unitId, unitName, zone, itemCode, itemName, amount(= landlordAmount), source: 'settlement', settlementId, reason, hashOk }`. 정렬: 날짜 → 정산 id → 항목 코드.
    - `pending`: 확정 전(draft/hold) 정산을 지금 계산한 임대인 부담 항목, `date: null`, `status`. **호실 필터만** 적용(연도 없음), 합계 제외.
    - `years`: 필터 전 확정 행의 연도(내림차순) — 화면 연도 선택지.
  - API (`routes/owner.js`, owner만 · 헤더 없음 401 · 다른 역할 403 · 본인 호실이 아닌 `unitId` 403 · 숫자 아닌 year/unitId `400 VALIDATION`):
    - `GET /api/owner/repair-ledger?year=&unitId=` → `{ rows, pending, totals: { byUnit, byYear, total }, years, units: [{ id, name }] }`
    - `GET /api/owner/repair-ledger.csv?year=&unitId=` → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="repair-ledger[-연도][-unitN].csv"`, 본문 = BOM + `확정일,호실,구역,항목,금액,사유,정산번호` + 행(금액은 쉼표 없는 정수) + `합계,,,,<total>,,`, 줄바꿈 CRLF, 쉼표·따옴표는 CSV 이스케이프.
    - 확정 정산은 `getSettlementSnapshot` 그대로(다시 계산하지 않음). **변조된 스냅샷도 장부에 넣고 `hashOk: false`**로 표시(화면 빨간 "변경 감지"). 스냅샷 없는 옛 확정분은 계산값 + `hashOk: null`. `computeSettlementBody`를 `routes/settlements.js`에서 export.
  - 프론트: 라우트 `/owner/repair-ledger`(`owner-repair-ledger`, `RepairLedger.vue`) — 고지 "필요경비 인정 여부는 세무사 확인이 필요합니다", 연도·호실 선택(바꾸면 다시 조회), 표(확정일·호실·구역·항목·금액·사유 뱃지·정산 #) + 합계 줄, 호실별·연도별 합계, "예정 · 합계 제외" 목록, **"CSV 내려받기"**: 사용자 헤더가 필요해 `<a href>` 대신 `apiDownload`(fetch → Blob → 임시 링크 클릭, 파일 이름 `수선비장부[_연도][_호실].csv`).
    - `OWNER_NAV`에 "수선비 장부" 추가, `isNavActive` 수정(장부 경로는 장부만, 리포트는 그 밖의 `/owner/...`). 홈 오른쪽 위 "수선비 장부" 버튼.
    - 순수 로직 `lib/repairLedgerView.js`: `TAX_NOTICE`, `PENDING_NOTICE`, `reasonClass`, `ledgerQuery`, `csvFilename`, `pendingStatusLabel`, `filterLabel`, `hasTampered`. `lib/api.js`에 `apiDownload`.
- 수정 파일: `backend/src/db/schema.sql`, `src/repositories/settlementRepo.js`, `src/routes/settlements.js`, `src/routes/owner.js`, `src/lib/repairLedger.js`(신규), `test/repairLedger.test.js`(신규) / `frontend/src/lib/repairLedgerView.js`(신규), `src/views/RepairLedger.vue`(신규), `src/lib/api.js`, `src/lib/ownerHome.js`, `src/views/OwnerHome.vue`, `src/router/index.js`, `test/repairLedgerView.test.js`(신규), `test/ownerHome.test.js` / `CLAUDE.md`(invariant 한 줄, API surface), `시연가이드.md`(0장 표, 홈 내비, **3-1단계 수선비 장부와 CSV**, 6장 한 줄, 7장 체크리스트)
- 테스트: backend `npm test -- repairLedger` → 10개 통과(순수 5: 사유 순서·옛 스냅샷, 확정만 합계·예정 분리·임차인/보류 제외, 연도·호실 필터·byUnit·byYear, CSV BOM·헤더·이스케이프·합계 줄, 필터 검증 / API 5: 확정 전 예정만·합계 0, 시연 모두 동의 → 105,000(자연 마모 후보·소액 일괄, 확정 뒤 DB 변경 무시, 필터), 이의 → 임대인 부담 → 585,000(벽지 "이의 후 임대인 부담"), CSV 헤더·BOM 바이트·합계 줄, 권한 403/401). backend 전체 `npm test` → **260개 통과** (250 + 10). frontend `npm test -- repairLedger ownerHome` → 14개, 전체 **120개 통과** (117 + 3: 순수 2, 화면 1 / ownerHome 내비·홈 링크는 기존 테스트에 추가). `vite build` 통과. 브라우저 화면·엑셀 열기는 사람이 확인.
- 다음 창 주의:
  - 창 12~16 추가분은 모두 끝났다. 시연 기준 값(770,000 / 105,000 / 49,230,000)은 그대로.
  - 소액 일괄·PATCH가 `payer_source`를 쓰므로 정산 항목을 새로 바꾸는 경로를 만들면 `payerSource`도 정할 것(없으면 사유가 "자연 마모 후보"/"임대인 선택"으로만 나온다).
  - 장부는 정산 원천(`source: 'settlement'`)만 있다. 다른 수선비(직접 입력 등)를 더하려면 행 모양에 `source`를 늘리면 된다.

### 창 15 · 확정 정산서 동결과 해시 — 완료 (2026-09-26)
- 한 일:
  - 테이블 `settlement_snapshots(id, settlement_id UNIQUE, snapshot_json, snapshot_hash, created_at)`. `settlementRepo`: `insertSettlementSnapshot`(JSON 문자열 그대로 `hashSnapshot`), `getSettlementSnapshot`, `verifySettlementSnapshot` → `{ storedHash, currentHash, ok, confirmedAt }`(`lib/snapshotHash.js`의 `verifySnapshot` 재사용, 리포트 해시 로직은 그대로).
  - `routes/settlements.js`: 계산부를 `computeSettlementBody`(동결 대상 = 행 메타 + `unitName` + 계산 결과 + 항목별 임차인 응답 + **`basis.clause` 특약 원문**)로 분리. `settlementBody`는 `confirmed`이고 스냅샷이 있으면 스냅샷 JSON 그대로(`frozen: true`), 아니면 계산(`frozen: false`). 임대인 응답은 여기에 최근 링크 `shareLink`만 붙인다(링크는 동결 대상이 아님). 링크 조회(`buildShareView`)도 같은 본문에서 임차인 부담 항목만 고른다 → 확정 뒤에는 스냅샷 기준.
  - `POST /:id/confirm`: 확정 조건은 그대로. `confirmSettlement` + 스냅샷 저장을 **한 트랜잭션**에서. 스냅샷에는 `status: 'confirmed'`, `confirmedAt`이 들어간다.
  - `GET /api/settlements/:id/verify` (그 호실 owner/tenant, 시공업자 403, 없음 404, 확정 전 `400 SETTLEMENT_NOT_CONFIRMED`). `GET /api/share/settlement/:token` 응답에 `verify` 추가(확정 전 null).
  - 임대인 정산 응답의 항목 `basis`에 `clause: { clauseNo, title, text } | null`이 추가됐다(스냅샷에 특약 원문을 넣기 위해 — 기존 테스트 한 줄을 `toMatchObject`로).
  - `scripts/tamper.js`에 정산 대상: `npm run demo:tamper-settlement -- <id>`(스냅샷 `totals.tenantTotal`을 100,000원 줄임, 항목·반환 예정액은 그대로) / `npm run demo:restore-settlement -- <id>`. 백업 `backend/.demo-tamper/settlement-<id>.json`, 리포트와 같은 방식(두 번 변조해도 원본 기준). 확정 스냅샷이 없으면 안내 후 종료.
  - 프론트: `integrityBadge(verify, kind)` — `kind: 'settlement'` → "정산서 동결 · SHA-256 앞4…뒤4 · 확정 이후 변경 없음", 변조는 리포트와 같은 빨간 "변경 감지 · 기록된 해시와 다름". `IntegrityBadge`에 `kind` prop. `SettlementView.vue`는 확정 정산이면 `/verify`를 불러 확정 배너 안에 뱃지(실패하면 뱃지만 빠짐), `SharedSettlement.vue`는 링크 응답의 `verify`로 "합의 확정된 정산입니다" 안에 뱃지.
- 수정 파일: `backend/src/db/schema.sql`, `src/repositories/settlementRepo.js`, `src/routes/settlements.js`, `scripts/tamper.js`, `package.json`, `test/settlementSnapshot.test.js`(신규), `test/settlement.test.js`(basis 비교 한 줄) / `frontend/src/lib/reportView.js`, `src/components/IntegrityBadge.vue`, `src/views/SettlementView.vue`, `src/views/SharedSettlement.vue`, `test/reportView.test.js`, `test/settlementShareView.test.js` / `CLAUDE.md`, `시연가이드.md`(3단계 8번 확정 뱃지, (선택) 정산서 변조 시연, 4단계 주의 문구, 6장 문제 해결 한 줄)
- 테스트: backend `npm test -- settlementSnapshot` → 5개 통과(확정 전 스냅샷 없음·verify 400·링크 verify null / 확정 시 스냅샷·해시·770,000/105,000/49,230,000·특약 원문 동결 / 확정 뒤 DB에서 견적·부담자·특약을 바꿔도 정산·링크 조회 불변 / 스냅샷 변조 → 정산·링크 verify ok=false → 되돌리면 ok / 권한 tenant 200·시공업자 403·401·404). backend 전체 `npm test` → **250개 통과**. frontend `npm test` → **117개 통과** (115 + 2: 정산서 뱃지 문구, 링크 화면 확정 뱃지·변경 감지). `vite build` 통과.
  - 실제 app.db로 확인(서버 없이 in-process 요청): 소액 일괄 → 링크 → 두 항목 동의 → 확정 770,000 → verify ok → `demo:tamper-settlement -- 1` → ok=false, 조회 합계 670,000 → `demo:restore-settlement -- 1` → ok, 770,000. 없는 정산 id 안내, 리포트 `demo:tamper/restore -- 5`도 그대로 동작. 확인 뒤 `npm run db:init`으로 초기화했다. 브라우저 화면은 사람이 확인.
- 다음 창 주의 (창 16):
  - 수선비 장부는 확정 정산의 `getSettlementSnapshot(db, id)`에서 `payer === 'landlord'` 항목(`landlordAmount`)을 읽으면 된다. 스냅샷에는 임대인·보류 항목, `defaultPayer`, `estimateCost`, 응답이 모두 들어 있다.
  - 변조된 스냅샷도 조회는 그대로 보여 준다(뱃지로만 경고). 장부에서 검증 실패 정산을 어떻게 표시할지 정할 것.
  - 해시 도입 전에 확정된 정산(스냅샷 없음)은 예전처럼 계산해서 보여 주고 verify는 400/null — 시드 정산은 확정 전이라 해당 없음.

### 창 14 · 임대인 홈 "오늘 할 일" — 완료 (2026-09-26)
- 한 일 (프론트만, 백엔드 변경 없음):
  - 라우트 `/owner`(`owner-home`, `OwnerHome.vue`). `homePathForRole('owner')` → `/owner` (김임대 선택 후 첫 화면).
  - 홈: 날짜(브라우저 현지) · "오늘 확인할 일 n건"(없으면 "오늘 확인할 일이 없습니다") · 할 일 카드(호실·제목·detail·D-day 칩, 왼쪽 테두리 색, 카드 전체가 링크) · 호실 현황(계약 상태 뱃지·임차인·다음 기한, "계약 이력"·"리포트" 링크). 데이터 = `GET /api/owner/todos` + `GET /api/reports`(퇴거 카드 링크용, 실패해도 홈은 뜬다).
  - `App.vue` 상단 내비(임대인만, 공유 화면 제외): "홈"(`/owner`) · "리포트"(`/owner/reports` 및 그 밖의 `/owner/...`에서 활성). 기존 리포트 목록 화면은 그대로.
  - **퇴거 카드 링크는 프론트가 만든다**: 백엔드 `move_out` link는 여전히 `/owner/compare`(query 없음)이고, `todoLink`가 `/api/reports`에서 그 호실(unitName으로 구분)의 가장 최근 퇴거 전/후 리포트 + 그 날짜 이전(같은 날 포함) 가장 최근 입주 전 리포트를 골라 `/owner/compare?leftId=입주&rightId=퇴거`. 퇴거가 없으면 `leftId`만, 둘 다 없으면 query 없음. 나머지 카드(제보·정산·특약·신고·갱신)는 백엔드 `link` 그대로.
  - `ReportCompareView.vue`: query `leftId`·`rightId`가 목록에 있는 리포트면 미리 선택하고 **둘 다 있으면 바로 비교**를 실행. 없거나 목록에 없는 id면 기존 동작(빈 선택).
  - `OwnerReports.vue`: `?unit=호실이름`이면 호실 필터를 미리 선택(홈 호실 카드의 "리포트").
  - 순수 로직 `lib/ownerHome.js`: `formatToday`, `todoCountText`, `ddayChip`(crit 빨강 / warn 주황 / calm 회색, D-n · D-DAY · "D+n 지남" · 기한 없음 = crit "바로 확인" / warn "확인 필요" / calm "참고"), `cardBorderClass`, `moveReportPair`, `compareLink`, `todoLink`, `comparePreselect`, `leaseStatusBadge`(none 계약 없음 / upcoming 입주 예정 / active 계약 중 / ending 종료 임박 / ended 계약 종료), `nextDueText`, `unitLinks`, `OWNER_NAV`, `isNavActive`.
- 시연 데이터로 본 결과(app.db, 2026-09-26): 4건 — 1234호 퇴거 crit "D+208 지남" → `/owner/compare?leftId=4&rightId=5` / 345호 특약 확인 대기 warn "확인 필요" / 345호 입주 제보 calm D-5 → `/owner/reports/6/tenant-reports` / 345호 전월세 신고 calm D-28.
- 수정 파일: `frontend/src/lib/ownerHome.js`(신규), `src/views/OwnerHome.vue`(신규), `test/ownerHome.test.js`(신규), `src/App.vue`, `src/router/index.js`, `src/stores/session.js`, `src/views/ReportCompareView.vue`, `src/views/OwnerReports.vue`, `test/session.test.js`(owner 홈 경로) / `시연가이드.md`(0장 표, 2-3, 3장 "홈 · 오늘 할 일" 장면, 1단계 1번, 4단계 1번, 4장 계약·제보 진입 경로, 7장 체크리스트)
- 테스트: frontend `npm test -- ownerHome` → 11개 통과(순수 8: 날짜·건수 문구, 칩 색·문구, 계약 상태·다음 기한, 내비 활성, 퇴거 링크, 입주/퇴거 고르기 경계, 백엔드 link 그대로·호실 링크, query 미리 선택 / 화면 3: 홈 카드·칩·링크·호실, 빈 상태, 비교 화면 query → 선택 + 자동 비교·query 없으면 기존 동작). frontend 전체 `npm test` → **115개 통과** (104 + 11). `vite build` 통과. 백엔드·시드는 바꾸지 않았다(db:init 불필요). 브라우저 화면은 사람이 확인.
- 다음 창 주의 (창 15·16):
  - 창 16의 수선비 장부 링크는 `OWNER_NAV`(`lib/ownerHome.js`)에 항목을 더하면 내비에 나온다. `isNavActive`는 홈(`/owner`)이 아닌 항목을 모두 `/owner/...` 접두사로 판단하므로, 내비 항목이 3개가 되면 리포트/장부를 경로로 구분하도록 고칠 것.
  - 백엔드 `move_out` link를 query 포함으로 바꾸고 싶다면 `todoLink`의 `move_out` 분기를 지우면 된다(지금은 프론트가 덮어쓴다).

### 창 13 · 입주 제보 시연 데이터와 할 일 계산 — 완료 (2026-09-26)
- 한 일:
  - **시드** (`seed(db, { now })` — `now` 생략 시 현재 시각, 테스트는 주입):
    - 사용자 **최임차**(tenant, id 4) 추가, 345호 tenant로 연결. 사용자 4 · 리포트 6 · 점검 8.
    - 345호 계약(id 2): 시작 = 실행일 − 2일(서버 현지 날짜), 종료 = 시작 + 2년, 보증금 30,000,000 · 월세 900,000, 특약 제1항 `CLEANING_FEE`(150,000) + 제2항 자유 문장 "에어컨 배수 호스 막힘은 임차인이 사용 중 관리한다." 임차인 확인 없음.
    - 345호 입주 전 리포트 **id 6**(1234호 시연 데이터 뒤에 만들어 id 4·5 그대로): 날짜 = 계약 시작일 10:00, 작성자 7개 구역 확인, tenant 확인 없음, 이상 항목 없음(A등급), 거실·주방 전경 사진 2장 → 제보 마감 = 실행일 + 5일(D-5).
    - 기존 345호 입주 전 리포트(id 3)·작성 중·제출 대기 점검은 그대로. 1234호 시연 값(770,000 / 105,000 / 49,230,000) 그대로.
  - **순수 로직 `lib/todos.js`**: `buildOwnerTodos({ leases, reports, settlements, tenantReports, now })` → 정렬된 카드, `buildUnitSummaries`, `sortTodos`, 날짜 도우미 `daysBetween`·`addDays`·`addMonths`(없는 날은 말일)·`ddayLabel`. 날짜는 서버 현지 날짜(`toDateString`).
  - 카드 모양: `{ kind, unitId, unitName, title, detail, dueDate, dday, severity, link }` — `dday` = dueDate − 오늘(음수 = 지남, 기한 없으면 `null`). 정렬: severity(crit > warn > calm) → dday 오름차순(null은 뒤) → 호실 이름.
  - 카드 종류:
    | kind | 조건 | title | severity | dueDate | link |
    |---|---|---|---|---|---|
    | `move_out` | 호실의 **최근 계약**이 종료 60일 이내(당일 60 포함)이거나 지났고, 그 계약의 `confirmed` 정산 없음 | 퇴거 점검과 보증금 공제 준비 | 지났으면 crit, 아니면 warn | 종료일 | `/owner/compare` |
    | `report_window` | 호실의 **가장 최근(id 큰) 입주 전 리포트**의 제보 기간이 열려 있음(창 10 `reportWindow`, 계약은 `getLeaseForDate`) | 입주 제보 승인 대기 n건 · 미확인 구역 n | 대기 > 0 warn, 아니면 calm | 마감일 (detail "마감 D-n" / "오늘 마감") | `/owner/reports/:id/tenant-reports` |
    | `settlement_hold` | 확정 전 정산이 `hold`이거나 임차인 부담 항목에 이의 | 정산 보류 · 임차인 이의 n건 | crit | null | `/owner/settlement?moveInReportId=&moveOutReportId=` |
    | `settlement_waiting` | 확정 전·보류 아님, 정산 링크를 만든 적 있고 응답 없는 임차인 부담 항목 n > 0 | 임차인 응답 대기 n건 | warn | 최근 링크 만료일 | 같음 |
    | `lease_unconfirmed` | 끝나지 않은 계약(종료일 ≥ 오늘)의 특약을 임차인이 모두 확인하지 않음 | 임차인 특약 확인 대기 | warn | null | `/owner/units/:id/leases` |
    | `rent_report` | 오늘 ≤ 시작일 + 30일(시작일을 계약일로 간주, 당일 포함) | 전월세 신고 기한 | 7일 이내 warn, 아니면 calm | 시작일 + 30일 | 같음 |
    | `renewal_notice` | 최근 계약, 만료 6개월 전 ~ 2개월 전(양 끝 포함) → "갱신 거절 통지 기간 중"(dueDate = 2개월 전 날) / 그 뒤 ~ 만료일 → "통지 기간 지남 · 묵시적 갱신 여부 확인"(dueDate = 만료일) | (왼쪽) | warn | (왼쪽) | 같음 |
    - `rent_report`·`renewal_notice` detail에 "안내용 계산이며 법률 자문이 아닙니다". 알림 발송 없음.
- API:
  - `GET /api/owner/todos` (owner만, 아니면 403, 헤더 없음 401) → `{ todos: [카드], units: [{ unitId, unitName, leaseStatus, tenantName, nextDue }] }`. 본인 호실(`unit_users` owner) 기준. `leaseStatus`: 최근 계약으로 `none` / `upcoming`(시작 전) / `active` / `ending`(60일 이내 종료) / `ended`. `nextDue`: 그 호실 카드 중 dday ≥ 0인 가장 가까운 것 `{ kind, title, dueDate, dday }` | null.
  - `createOwnerRouter(db, { now })` (`routes/owner.js`), `createApp(db, { now })` 시각 사용.
- 시연 데이터로 본 결과(실행일 2026-09-26 기준): 1234호 `move_out` crit(계약 종료 2026-03-02 지남, 정산 초안 미확정) → 345호 `lease_unconfirmed` warn → 345호 `report_window` calm "입주 제보 승인 대기 0건 · 미확인 구역 7", "마감 D-5" → 345호 `rent_report` calm(D-28). units: 1234호 `ended`·박임차·nextDue null, 345호 `active`·최임차·nextDue report_window D-5.
- 수정 파일: `backend/src/lib/todos.js`(신규), `src/routes/owner.js`(신규), `test/todos.test.js`(신규), `src/routes/api.js`, `src/db/seed.js`, `test/db.test.js`·`test/api.test.js`·`test/reports.test.js`(수량만), `test/lease.test.js`(1234호 계약만 세기, 404 테스트는 345호 계약을 지운 뒤), `test/leaseRegister.test.js`(`seed(db, { now })`, 계약 수 2, 345호 등록 기간을 시드 계약 뒤로, 345호 tenant 연결 2명) / `시연가이드.md`(시드 설명, counts, 입주 제보 장면 345호·최임차, 목업 목록에서 "임차인 입주 제보 입력" 제거, 초기화 문구) / `CLAUDE.md`(API surface, invariant 한 줄)
- 테스트: backend `npm test -- todos` → 11개 통과(순수 8: move_out 60/61일·지남·확정·새 계약, rent_report 30/31일·7일 warn, renewal 6개월 전 하루 전/당일·2개월 전 당일/다음 날·만료 뒤, addMonths 말일, lease_unconfirmed, report_window D-5·오늘 마감·닫힘, 정산 보류/대기/확정, 정렬 / API 3: 시드 모양, 시연 데이터 report_window "마감 D-5" + 최임차 제보 뒤 대기 1건, 권한 403/401). backend 전체 `npm test` → **245개 통과** (234 + 11). `npm run db:init` 재실행 완료(counts users 4 · reports 6 · inspections 8). 프론트는 바꾸지 않았다.
- 다음 창 주의 (창 14):
  - 345호 목록에는 같은 모양의 입주 전 점검(A)이 2개(id 3 옛 시드, id 6 새 시드) 있다. 목록은 id 내림차순이라 id 6이 먼저. 할 일 카드는 id 6으로 링크한다.
  - `report_window`는 호실의 가장 최근 입주 리포트 하나만 본다. id 3도 날짜 규칙상 제보 기간이 열려 있어 최임차가 제보할 수는 있다(카드에는 안 나옴).
  - `move_out` 링크는 `/owner/compare`(query 없음) — 창 14에서 비교 화면 query 미리 선택을 붙이면 여기 link도 바꿀 것. 카드의 `link`는 프론트 라우트 경로 그대로.
  - 시드 날짜가 실행일 기준이라 **발표 당일(또는 5일 안)에 db:init** 해야 D-5 장면이 나온다. 다른 테스트의 `seed(db)`는 현재 시각을 쓴다(345호 날짜에 기대는 테스트는 `seed(db, { now })`로 고정).

### 창 12 · 계약·특약 등록 화면 — 완료 (2026-09-26)
- 한 일:
  - **정산의 계약 선택 수정**: `leaseRepo.getLeaseForDate(db, unitId, date)` — ① 입주 리포트 날짜가 기간(start_date ~ end_date, 양 끝 포함)에 드는 계약(여럿이면 늦게 시작한 것) ② 없으면 그 날짜 이전에 시작한 가장 최근 계약 ③ 그것도 없으면 그 날짜 뒤에 시작하는 가장 이른 계약(계약 시작 전 입주 점검 — 기존 정산 테스트의 입주 리포트가 2024-03-01, 계약은 03-02라 필요했다). `routes/settlements.js`(정산·링크 화면)와 `routes/tenantReports.js`(제보 기간)가 이것을 쓴다. `GET /api/units/:id/lease`(단수)는 그대로 "최근 계약". 정산 계산 규칙은 바꾸지 않았다.
  - 순수 로직 `lib/leaseInput.js`: `normalizeLeaseInput`(특약 번호 1부터, 템플릿 파라미터는 `defaultParams`에 있는 이름만·0 이상 정수, 자유 문장 trim·500자), `periodsOverlap`(기존 종료일 = 새 시작일은 겹치지 않음 — 같은 날 인수인계 허용), `isValidDate`.
  - `leaseRepo`: `getLeaseById`, `getLeaseForDate`, `listLeasesByUnitId(db, unitId, { tenantUserId })`, `confirmLeaseClauses`, `linkUnitTenant`. 계약 응답에 `tenantName`, `createdAt`, `tenantConfirmed`(특약 모두 확인, 특약 없으면 true), `tenantConfirmedAt`(모두 확인이면 가장 늦은 시각) 추가.
- API:
  - `GET /api/clause-templates` (비인증) → `{ templates: [{ code, title, applyMode, defaultParams, defaultText }] }`
  - `GET /api/units/:id/leases` (그 호실 owner/tenant, 아니면 403) → `{ leases: [lease] }` 최신 시작일 먼저. **tenant는 본인 계약만** 받는다(다음 임차인의 보증금이 옛 임차인에게 보이지 않게). lease 모양은 창 6 `GET /units/:id/lease`와 같고 위 필드가 더해졌다. 특약마다 `applyMode`(auto/display/manual)·`tenantConfirmedAt`.
  - `POST /api/units/:id/leases` (그 호실 owner만, 아니면 403) `{ tenantUserId, deposit, monthlyRent, startDate, endDate, clauses: [{ templateCode, params? } | { text }] }` → `201 { lease }`. 템플릿은 `buildClause`로 text·rule, 자유 문장은 `template_code NULL`. `400`: `VALIDATION`(임차인 없음·빈 특약 문장) / `INVALID_AMOUNT`(음수·빈 값) / `INVALID_PERIOD`(형식·시작 ≥ 종료) / `UNKNOWN_TEMPLATE` / `INVALID_PARAM` / `INVALID_TENANT`(tenant 역할 아님) / `LEASE_OVERLAP`. 임차인이 그 호실 `unit_users`에 없으면 tenant로 연결(트랜잭션 안).
  - `POST /api/leases/:id/confirm` (그 계약의 임차인만, 아니면 403, 없으면 404) → `{ lease }`. 미확인 특약에만 `tenant_confirmed_at` = 서버 시각(ISO, `createApp(db, { now })`) 기록, 이미 확인한 특약은 그대로.
- 프론트:
  - 라우트 `/owner/units/:id/leases`(`owner-leases`, `LeaseList.vue`): 계약 카드(기간·임차인·보증금·월세·확인 뱃지), 특약 목록(자동/표시/수동 뱃지, 특약별 확인 시각), "+ 새 계약 등록".
  - 라우트 `/owner/units/:id/leases/new`(`owner-lease-new`, `LeaseForm.vue`): 임차인 선택(tenant 역할만), 보증금·월세(쉼표 허용)·기간, 템플릿 칩(선택/해제, 적용 방식 표시) → 파라미터 입력·문구 미리보기, 직접 입력 특약 추가/삭제, 안내 2줄("템플릿 자동 적용 / 직접 입력 수동 확인", "특약 효력은 법률 검토가 필요할 수 있습니다"). 등록하면 이력으로 이동, 백엔드 오류 문구 그대로.
  - `OwnerReports.vue`: 필터 위에 호실별 "1234호 계약"·"345호 계약" 링크.
  - `TenantReports.vue`: 리포트 목록 위 노란 "확인할 계약" 카드(본인 미확인 계약마다) → 특약 원문 → "계약·특약 확인".
  - `SettlementView.vue`: 특약 요약을 `GET /units/:id/lease`(최근 계약) 대신 `GET /units/:id/leases`에서 `settlement.leaseId` 계약으로 가져온다(새 계약 등록 뒤 제목이 바뀌지 않게).
  - 순수 로직 `lib/leaseForm.js`: `APPLY_MODE_LABEL`, `LEASE_NOTICES`, `PARAM_FIELDS`, `emptyLeaseForm`, `parseWon`, `toggleTemplateClause`, `isTemplateSelected`, `addTextClause`, `removeClause`, `clausePreview`(기본 문구 속 기본값을 입력값으로 치환), `validateLeaseForm`, `hasFormErrors`, `buildLeasePayload`, `pendingLeases`, `leaseConfirmBadge`, `formatConfirmedAt`.
- 수정 파일: `backend/src/lib/leaseInput.js`(신규), `src/repositories/leaseRepo.js`, `src/routes/api.js`, `src/routes/settlements.js`, `src/routes/tenantReports.js`, `test/leaseRegister.test.js`(신규) / `frontend/src/lib/leaseForm.js`(신규), `src/views/LeaseForm.vue`(신규), `src/views/LeaseList.vue`(신규), `src/views/OwnerReports.vue`, `src/views/TenantReports.vue`, `src/views/SettlementView.vue`, `src/router/index.js`, `test/leaseForm.test.js`(신규), `test/settlementView.test.js` / `시연가이드.md`(4장 계약·특약 등록 장면, 5장 초기화 문구), `CLAUDE.md`(API surface, invariant 한 줄)
- 테스트: backend `npm test -- leaseRegister` → 12개 통과(순수 3, API 9: 템플릿 목록, 등록 특약 1·2·3항, **새 계약(2026-04-01) 등록 뒤 1234호 정산 770,000 / 105,000 / 49,230,000**, getLeaseForDate 순서, 겹침·날짜·금액·역할 400, 권한 403/401, 호실 tenant 연결, 이력 순서·자동/수동, 확인 권한·재확인 시각 유지). backend 전체 → **234개 통과** (222 + 12). frontend `leaseForm` 8개(순수 6, LeaseForm 화면 1, TenantReports 확인 카드 1) → 전체 **104개 통과** (96 + 8). `vite build` 통과. 시드·스키마는 바꾸지 않았다(db:init 불필요). 브라우저 화면은 사람이 확인.
- 직접 확인할 화면: 시연가이드 4장 "(선택) 계약·특약 등록" 순서 그대로. 연습 뒤 `npm run db:init`.
- 다음 창 주의 (창 13):
  - 345호 계약·입주 리포트를 시드할 때 **입주 리포트 날짜가 계약 기간 안(또는 계약 시작 전)** 이어야 제보 기간·정산이 그 계약을 쓴다. 계약 시작 = db:init − 2일, 입주 리포트 = 그 사이 날짜면 된다.
  - 계약 공백 기간(옛 계약 종료 ~ 새 계약 시작)에 한 입주 점검은 ②번 규칙 때문에 **옛 계약**을 고른다(사용자 지정 순서). 새 임차인의 입주 점검을 계약 시작 전에 하는 시드를 만들면 이 점을 확인할 것.
  - 계약 수정·삭제 API는 없다. 시연용 계약은 db:init으로만 지운다.

### 창 11 · 임차인 링크 응답과 정산 보류 — 완료 (2026-09-26)
- 한 일:
  - 순수 로직 `lib/settlementShare.js`: `SHARE_LINK_DAYS=7`, `shareExpiresAt(now)`, `isShareExpired(expiresAt, now)`(만료 시각 정각부터 만료, 값 없으면 만료), `assertShareLinkUsable`(없음 404 / 만료 `410 SHARE_LINK_EXPIRED`), `normalizeTenantResponse`, `chargedItems`, `settlementStatus(current, items)`, `confirmCheck(items)`, `assertEditableAfterResponse`, `shareMessage`(모의 알림 문구).
  - 스키마:
    - `share_links.expires_at TEXT`(ISO). 리포트 공유 링크도 생성 후 7일 뒤 만료 → `GET /api/share/:token` 410. 응답에 `expiresAt` 추가. `reportRepo`의 `getReportByToken`·`getReportIdByToken` → `getShareLink(db, token)`으로 바꿨다.
    - `settlements.status`에 `'hold'` 추가, `confirmed_at` 추가.
    - `settlement_items.tenant_response`에 CHECK(`agree`|`object`), `tenant_response_text`, `tenant_response_image`, `tenant_responded_at` 추가.
    - 새 테이블 `settlement_share_links(id, settlement_id, token UNIQUE, created_by, created_at, expires_at, first_viewed_at NULL)`.
  - **상태 규칙**: 상태는 저장하지만 매번 항목에서 다시 맞춘다(`syncStatus`). 임차인 부담 항목에 이의가 하나라도 있으면 `hold`, 없으면 `draft`, `confirmed`는 그대로. 이의 항목을 임대인 부담으로 돌리면 보류가 풀린다(이의 기록은 남음). 다시 임차인으로 돌리는 것은 막혀 있다(아래).
  - **응답 뒤 수정 제한**: 임차인이 응답한 항목은 임대인도 `{ payer: 'landlord' }`만 가능(`400 ITEM_RESPONDED`). 동의한 금액이 뒤에서 바뀌지 않게 하려는 것. 소액 일괄은 임대인으로만 바꾸므로 그대로 동작.
  - **확정 조건**(`confirmCheck` 순서): 이의 있음 `SETTLEMENT_ON_HOLD` → 부담자 보류 항목 있음 `ITEMS_ON_HOLD` → 임차인 부담 항목 중 동의 아닌 것 `NOT_ALL_AGREED`. 요청의 "모든 청구 항목 agree"에 더해 **보류(부담자 미정) 항목이 남아 있어도 확정을 막았다** — 시연 정산은 소액 일괄을 먼저 눌러야 확정할 수 있다.
  - 청소비(`fees[]`, 특약 고정 금액)는 `settlement_items`가 아니라 응답 대상이 아니다. 링크 화면에는 특약 원문과 함께 보여 준다.
- API:
  - `POST /api/settlements/:id/share` (그 호실 owner만, 확정 뒤 400) → `201 { token, path: '/share/settlement/<token>', expiresAt, message, sent: false, settlement }`. `message`는 모의 알림 문구 — 실제 발송·알림톡 없음.
  - `GET /api/share/settlement/:token` (비인증) → `{ settlement: { id, unitName, status, confirmedAt, moveInDate, moveOutDate, elapsedMonths, items: [임차인 부담만 — { itemCode, zone, name, tier, from, to, evidence, lifespanYears, estimateCost, tenantAmount, basis: { type, clauseNo, stdAmount, residual, clause: { clauseNo, title, text } | null }, response: { response, text, image, respondedAt } | null }], fees, totals: { tenantTotal, deposit, depositReturn } }, link: { expiresAt, firstViewedAt } }`. 임대인 부담·보류 항목, 수선비 장부 금액은 보내지 않는다. 첫 조회 때 `first_viewed_at` 기록(이후 그대로).
  - `POST /api/share/settlement/:token/respond` `{ itemCode, response, text?, image? }` → `{ settlement }`(위와 같은 모양). `400 INVALID_RESPONSE` / 이의 내용 없음 `VALIDATION` / `NOT_CHARGED` / `ALREADY_RESPONDED` / 확정 뒤 `SETTLEMENT_CONFIRMED` / 없는 항목 404 / 만료 410. 동의에는 사진을 저장하지 않는다.
  - `POST /api/settlements/:id/confirm` (owner만) → `{ settlement }`(status `confirmed`, `confirmedAt`). 위 확정 조건 400, 이미 확정 `SETTLEMENT_CONFIRMED`.
  - 정산 응답(`GET/PATCH ...`)에 `confirmedAt`, 항목별 `tenantResponseText`·`tenantResponseImage`·`tenantRespondedAt`, 최근 링크 `shareLink: { token, path, createdAt, expiresAt, expired, firstViewedAt } | null` 추가.
  - `createSettlementsRouter(db, { now })`, `createSettlementShareRouter(db, { now })`, 리포트 라우터·`/share/:token`도 `createApp(db, { now })` 시각을 쓴다.
- 프론트:
  - `views/SharedSettlement.vue`, 라우트 `/share/settlement/:token` (`shared-settlement`, 로그인 불필요): 호실·기간·링크 유효/최초 열람, 안내("수정·삭제 기능이 없습니다", 이의 있으면 보류), 진행 현황, 항목 카드(상태·청구 가능성·금액·적용 기준·**특약 원문 인용**·표준 기준 계산), 동의/이의 선택 → 이의면 내용(필수)·사진 1장(10MB) → "응답 남기기". 응답하면 입력 폼 대신 응답 기록(뱃지·시각·"수정 불가"·내용·사진). 청소비 줄(특약 원문), 합계·반환 예정, 고지 문구. 만료·잘못된 링크는 백엔드 문구 그대로.
  - `SettlementView.vue`(임대인): 보류 배너 "정산 보류 · 임차인 이의 n건" / 확정 배너, 항목마다 임차인 응답(뱃지·시각·내용·사진), 이의 항목에 "임대인 부담으로 돌리기", 응답한 항목은 부담자·견적 입력 비활성, "임차인 확인 링크" 상자(링크 만들기/새 링크, 주소·복사, 유효기간·최초 열람, **모의 알림 문구 "실제로 발송하지 않습니다"**), "합의 확정" 버튼 + 막힌 이유.
  - `SharedReport.vue`: 만료(410) 문구를 백엔드 메시지로 보여 준다.
  - 순수 로직 `lib/settlementShareView.js`: `RESPONSE_OPTIONS`, `formatDateTime`, `responseBadge`, `objectedItems`, `waitingItems`, `confirmState`, `statusBanner`, `shareLinkStatus`, `shareUrl`, `shareBasisView`, `responseFormError`, `responsePayload`, `responseProgress`.
- 수정 파일: `backend/src/lib/settlementShare.js`(신규), `test/settlementShare.test.js`(신규), `src/db/schema.sql`, `src/repositories/settlementRepo.js`, `src/repositories/reportRepo.js`, `src/routes/settlements.js`, `src/routes/reports.js`, `src/routes/api.js` / `frontend/src/lib/settlementShareView.js`(신규), `src/views/SharedSettlement.vue`(신규), `test/settlementShareView.test.js`(신규), `src/views/SettlementView.vue`, `src/views/SharedReport.vue`, `src/router/index.js` / `CLAUDE.md`
- 테스트: backend `npm test -- settlementShare` → 12개 통과(순수 5, API 7: 링크 생성 권한·모의 문구, 조회 필터·특약 원문·최초 열람, 정산 링크 만료 410, 리포트 링크 만료 410, 권한 없는 수정 차단, 이의 → hold → 확정 400 → 임대인 부담으로 돌리기, 보류·무응답 확정 400 → 전부 동의 → 확정 성공). backend 전체 `npm test` → **222개 통과** (210 + 12). frontend 전체 `npm test` → **96개 통과** (89 + 7). `vite build` 통과. `npm run db:init` 재실행 완료. 브라우저 화면은 사람이 확인.
- 직접 확인할 화면 (`Stop-Process -Name node -Force` → backend `npm run db:init` → `npm run dev`, frontend `npm run dev`):
  - 김임대 → 비교 화면 → 1234호 입주 전 ↔ 퇴거 후 → "보증금 공제 근거 만들기" → 소액 일괄 → "임차인 응답 링크 만들기" → 노란 모의 알림 문구, 링크 주소
  - 링크 주소를 새 창(시크릿 창이어도 됨)에서 열기 → 벽지·실리콘 2개만, 벽지 특약 제3항 원문, 청소비 → 벽지 "이의" + 내용 → 보류 안내, 기록 "수정 불가"
  - 임대인 화면 새로고침 → 빨간 "정산 보류 · 임차인 이의 1건", 이의 내용, "합의 확정" 비활성 → "임대인 부담으로 돌리기" → 배너 사라짐(합계 임차인 290,000)
  - (또는 두 항목 모두 "동의" → 임대인 "합의 확정" → 확정 배너, 링크 화면도 "합의 확정된 정산")
  - 연습 뒤에는 `npm run db:init`.
- 다음 창 주의:
  - 창 11이 마지막 창이다. 시드는 바꾸지 않았다(시연 값 770,000 / 105,000 / 49,230,000 그대로, 링크는 없음).
  - 링크는 여러 개 만들 수 있고 모두 7일 동안 유효하다(새 링크가 옛 링크를 끄지 않는다). 임대인 화면은 가장 최근 링크만 보여 준다.
  - 이의를 받은 뒤 임대인이 할 수 있는 것은 "임대인 부담으로 돌리기"뿐이다. 금액을 조정해 다시 묻는 흐름(응답 초기화)은 없다 — "수정·삭제 없음" 규칙과 충돌하므로 필요하면 새 정산 이력으로 설계해야 한다.

### 창 10 · 입주 제보 승인 — 완료 (2026-09-26)
- 한 일:
  - 테이블 `tenant_reports(id, report_id(입주 전 리포트), item_code, state 'minor'|'damaged'|'broken', text, image_base64 NULL, status 'pending'|'approved'|'rejected', created_at, decided_at NULL)`.
  - 순수 로직 `lib/tenantReport.js`: `reportWindow(startDate, now)` → `{ startDate, deadline, open, daysLeft }`, `assertWindowOpen`, `normalizeTenantReport`, `zoneStatus(zones, confirmations)`.
    - **제보 기간**: 계약 시작일(계약 없으면 입주 리포트 날짜) + 7일 = 마감일, 마감일 당일까지 포함(초일 불산입과 같은 셈). 2024-03-02 시작 → 2024-03-09까지. 서버 현지 날짜 기준.
  - `repositories/tenantReportRepo.js`: 생성·조회·처리(pending만), 임차인 구역 확인(INSERT OR IGNORE), `diffExtrasFor(db, moveInReportId)` → `{ tenantZones, tenantReports }`.
  - `lib/diff.js` `diffBaseline(moveIn, moveOut, catalog, extras)` 4번째 인자(생략 가능, 기존 호출은 그대로 동작):
    - `extras.tenantZones`(발행 뒤 임차인 구역 확인)를 스냅샷의 구역 확인과 합친다 → 그 구역의 기록 없는 항목은 `normal`, evidence의 "tenant 확인"에도 들어간다.
    - `approved` 제보: 입주 상태 = 기록 상태와 제보 상태 중 더 나쁜 쪽. 승인 = 양측 확인이라 evidence 최소 `mid`, 제보 사진이 있으면 `high` + `moveInImages`에 `{ id:'tenant-report-<id>', kind:'tenant_report', data_base64 }`로 붙는다.
    - changes에 `tenantReported`(승인 제보 반영), `disputed`(승인 없이 거절 제보만 있음) 필드 추가. `pending`은 무시.
    - 스냅샷은 바꾸지 않는다(해시 그대로). 비교 API와 정산 라우트의 `changesFor`가 둘 다 extras를 넘긴다 → 두 화면의 입주 상태가 같다. `lib/settlement.js`(정산 계산)는 그대로.
  - `createApp(db, { now })` — 테스트가 시각을 주입한다(생략 시 현재 시각).
- API (모두 `x-user-id` 필요, 없으면 401):
  - `GET /api/reports/:id/tenant-reports` (그 호실 owner/tenant, 시공업자 403, 입주 전 리포트가 아니면 `400 NOT_MOVE_IN`) → `{ reportId, window, zones: [{ zone, authorConfirmed, tenantConfirmed }], unconfirmedZones, tenantReports: [{ id, reportId, itemCode, zone, name, tier, state, text, imageBase64, status, createdAt, decidedAt }] }`
  - `POST /api/reports/:id/tenant-reports` `{ itemCode, state, text, imageBase64? }` (그 호실 임차인만, 아니면 403) → `201 { tenantReport }`. 기간 지남 → `400 REPORT_WINDOW_CLOSED` "제보 기간이 끝났습니다." / `INVALID_ITEM_CODE` / `INVALID_STATE`(정상 불가) / 빈 내용 `VALIDATION` / 사진 10MB 초과 `IMAGE_TOO_LARGE`.
  - `POST /api/reports/:id/zone-confirm` `{ zone }` (임차인만, 같은 기간 제한) → `{ zones, unconfirmedZones }`. `INVALID_ZONE`.
  - `POST /api/tenant-reports/:id/approve` · `/reject` (그 호실 owner만, 아니면 403, 없으면 404) → `{ tenantReport }`. 이미 처리됨 → `400 ALREADY_DECIDED`. 마감 뒤에도 처리 가능.
- 시드: 1234호 입주 리포트(id 4)에 임차인 제보 2건 — 현관 신발장 경미(승인, 2024-03-05), 방1 문·문틀 경미(대기, 사진). 둘 다 퇴거 때 정상이라 승인해도 **시연 diff 4건·정산 770,000/105,000은 그대로**. 베란다는 임차인 미확인 그대로.
- 프론트:
  - `views/TenantReportReview.vue`, 라우트 `/owner/reports/:id/tenant-reports` (`owner-tenant-reports`): 마감 뱃지(D-n / D-DAY / 제보 마감), 기간 문구, 임차인 구역 확인 칸 7개 + 미확인 구역, 대기·승인·거절 개수, 제보 카드(구역·항목·핵심/일반·상태·내용·사진·시각, 대기면 승인/거절 버튼 → 응답으로 카드 갱신). 대기 제보가 먼저.
  - 임대인 리포트 상세(입주 전 리포트만)에 "입주 제보 승인" 버튼.
  - `components/TenantBaselineActions.vue`: 임차인 리포트 상세(입주 전 리포트만)에 "이상 제보"(구역 → 항목 → 경미/손상/파손 + 내용 + 사진 1장) / "구역 확인 (n/7)"(미확인 구역마다 "이상 없음 확인") 버튼, 내 제보 상태 목록. 기간이 지나면 버튼 비활성(백엔드도 400).
  - `DiffView`: `tenantReported` → "임차인 제보 승인 반영", `disputed` → 빨간 "다툼 · 입주 제보 거절됨".
  - 순수 로직 `lib/tenantReportView.js`: `REPORT_STATE_OPTIONS`, `statusBadge`, `deadlineBadge`, `windowText`, `countByStatus`, `sortReports`, `zoneCells`, `itemsOfZone`, `reportFormError`, `reportPayload`.
- 수정 파일: `backend/src/lib/tenantReport.js`(신규), `src/repositories/tenantReportRepo.js`(신규), `src/routes/tenantReports.js`(신규), `test/tenantReport.test.js`(신규), `src/lib/diff.js`, `src/db/schema.sql`, `src/db/seed.js`, `src/routes/reports.js`, `src/routes/settlements.js`(changesFor에 extras만), `src/routes/api.js`, `src/app.js` / `frontend/src/lib/tenantReportView.js`(신규), `src/views/TenantReportReview.vue`(신규), `src/components/TenantBaselineActions.vue`(신규), `test/tenantReportView.test.js`(신규), `src/views/ReportDetail.vue`, `src/components/DiffView.vue`, `src/router/index.js` / `CLAUDE.md`
- 테스트: backend `npm test -- tenantReport diff` → 29개 통과. backend 전체 `npm test` → **210개 통과** (192 + 신규 18: 기간 2 · 구역 1 · diff 5 · API 10 — 기간 제한, 승인/거절 권한, diff 반영). frontend 전체 `npm test` → **89개 통과** (82 + 신규 7). `vite build` 통과. `npm run db:init` 재실행 완료. 브라우저 화면은 사람이 확인.
- 직접 확인할 화면 (`Stop-Process -Name node -Force` → backend `npm run db:init` → `npm run dev`, frontend `npm run dev`):
  - 김임대 → 1234호 입주 전 리포트(id 4) 상세 → "입주 제보 승인" → "제보 마감", 미확인 구역 1(베란다), 방1 문 대기(승인/거절 버튼)가 먼저, 신발장 승인됨
  - 박임차 → 같은 리포트 상세 → "입주 확인" 상자, 버튼 비활성(시드 계약 시작이 2024-03-02라 기간이 지남). 입력 흐름은 테스트(시각 주입)로만 확인했다.
- 다음 창 주의 (창 11):
  - 시드 계약으로는 기간이 이미 지나 임차인 제보를 화면에서 새로 넣을 수 없다. 시연에서 보여 주려면 계약 시작일이 최근인 호실이 따로 필요하다(시연 값 24개월과 충돌하므로 별도 데이터로).
  - 승인은 입주 상태를 나쁘게만 만든다 → 정산을 만든 뒤 승인하면 항목이 diff에서 빠질 수 있다(정산 조회는 diff에 남은 항목만 보인다, 창 7 로직 그대로). 기본 부담자는 정산 생성 때만 정해진다.
  - `settlement_items.tenant_response`(창 11 이의 제기)와 `disputed`(입주 제보 거절)는 다른 개념이다.


### 창 9 · 해시 검증과 시연 준비 — 완료 (2026-09-26)
- 한 일:
  - `report_snapshots.snapshot_hash TEXT`(NULL 허용 — 해시 도입 전 행/테스트가 직접 넣은 행은 NULL → 검증 ok=false). 제출·시드 모두 `reportRepo.insertSnapshot(db, reportId, snapshot)`로 `snapshot_json` 문자열 그대로의 SHA-256(hex, `node:crypto`) 저장.
  - 순수 로직 `lib/snapshotHash.js`: `hashSnapshot(json)`, `verifySnapshot({ snapshotJson, storedHash, issuedAt })`. `reportRepo.verifyReportSnapshot(db, reportId)`.
  - API `GET /api/reports/:id/verify` → `{ storedHash, currentHash, ok, issuedAt }` (`issuedAt` = `reports.created_at`). 권한은 리포트 상세와 같음(401/403/404).
  - 공유 화면은 비인증이라 `GET /api/share/:token` 응답에 `verify`를 함께 넣었다(`{ report, verify }`).
  - 프론트: `components/IntegrityBadge.vue`(props `verify`), `lib/reportView.js`의 `shortHash`, `integrityBadge`. 리포트 상세(`ReportDetail.vue`, 임대인·임차인 공통)와 공유 화면(`SharedReport.vue`)에 뱃지. ok → 초록 "발행 동결 · SHA-256 앞4…뒤4 · 발행 이후 변경 없음", 아니면 빨간 "변경 감지 · 기록된 해시와 다름". verify 호출이 실패하면 뱃지만 빠진다. 인쇄 화면에는 넣지 않았다.
  - `backend/scripts/tamper.js` + `npm run demo:tamper -- <id>` / `npm run demo:restore -- <id>`: 스냅샷의 `BATHROOM_SILICONE` 상태를 한 단계 바꾼다(손상→경미, 경미→손상, 파손→손상). 원본 JSON은 `backend/.demo-tamper/report-<id>.json`(gitignore)에 그대로 보관하고 restore가 되돌린 뒤 지운다. 두 번 tamper해도 원본 기준이라 되돌아가지 않는다. 실리콘 기록이 없는 리포트·백업 없는 restore는 안내 후 종료. 서버가 켜져 있어도 동작(WAL).
  - 시연 시드(`seed.js` `seedDemoMoveInOut`, `npm run db:init` 한 번으로 준비). `createReport`에 `createdAt`, `tenantZones`, `images`(itemCode → 항목 사진, zone → 구역 전경) 추가. 사진은 글자가 든 SVG data URL.
    - 리포트 id 4: 1234호 입주 전 2024-03-02, 화장실 실리콘 minor(항목 사진 없음), 작성자 7개 구역 확인, tenant 확인 6개(베란다 제외), 거실·주방 전경 사진 → B등급
    - 리포트 id 5: 1234호 퇴거 후 2026-03-02, 거실 벽지 damaged · 주방 후드 필터 minor · 화장실 실리콘 damaged · 베란다 방충망 damaged, 항목 사진 4장 → D등급
    - 정산 id 1: 위 쌍, 기본 부담자 + 견적(벽지 480,000 / 실리콘 150,000 / 후드 필터 60,000 / 방충망 45,000, `DEMO_ESTIMATES`). 방충망은 보류.
  - README에 "발표 시연 순서 (버틀러, 창 9)" 추가(옛 시나리오는 그대로 둠).
  - CLAUDE.md: API 목록에 `/:id/verify`, 스냅샷 해시 규칙 추가.
- 수정 파일: `backend/src/lib/snapshotHash.js`(신규), `scripts/tamper.js`(신규), `test/snapshotHash.test.js`(신규), `src/db/schema.sql`, `src/db/seed.js`, `src/repositories/reportRepo.js`, `src/routes/reports.js`, `src/routes/api.js`, `package.json`, `.gitignore`, 리포트 수 변경으로 `test/db.test.js`·`test/reports.test.js`(3→5, 임차인 2→4) / `frontend/src/components/IntegrityBadge.vue`(신규), `src/lib/reportView.js`, `src/views/ReportDetail.vue`, `src/views/SharedReport.vue`, `test/reportView.test.js` / `README.md`, `CLAUDE.md`
- 테스트: `npm test -- snapshotHash` → 10개 통과(순수 2, API 6: 제출 해시 저장·시드 해시·verify ok·변조 시 ok=false 후 복구·권한·공유 응답, 시연 시드 2: diff 4건 evidence, 정산 770,000/105,000/49,230,000). backend 전체 `npm test` → **192개 통과** (182 + 신규 10). frontend 전체 `npm test` → **82개 통과** (79 + 신규 3). `vite build` 통과.
  - 실제 서버(포트 3100, app.db)로 확인: verify ok → 비교 4건(high/high/mid/low) → 정산 770,000 · 임대인 60,000 → 소액 일괄 후 105,000 → `demo:tamper -- 5` → verify·공유 모두 ok=false → `demo:restore -- 5` → ok=true. 확인 후 `npm run db:init`으로 다시 초기화.
- 시연 체크리스트 (시연 직전, 사람이 브라우저로):
  - [ ] `Stop-Process -Name node -Force` → backend `npm run db:init` → `npm run dev`, frontend `npm run dev`
  - [ ] 김임대 선택 → 리포트 목록에 5건 (1234호 입주 전 B · 퇴거 후 D 포함)
  - [ ] 리포트 비교: 1234호 입주 전 ↔ 퇴거 후 → 변경 4 · 변경 없음 36, 청구 가능성 높음 2 · 보통 1 · 낮음 1, 입주 사진 칸(거실·주방 "구역 전경"), 퇴거 사진 4장
  - [ ] 보증금 공제 근거 만들기 → 경과 24개월, 벽지 480,000(특약 제3항, 표준 참고 320,000), 실리콘 90,000(잔존 60%), 청소비 200,000, 제6항 수동 확인 상자
  - [ ] 소액 일괄 버튼 → 방충망 임대인 → 임차인 770,000 · 반환 예정 49,230,000 · 임대인 105,000
  - [ ] 퇴거 후 리포트(id 5) 상세 → 초록 "발행 동결 · SHA-256 앞4…뒤4 · 발행 이후 변경 없음" (스냅샷에 생성 시각이 들어가 `db:init`마다 해시 값이 달라진다)
  - [ ] `npm run demo:tamper -- 5` → 새로고침 → 빨간 "변경 감지 · 기록된 해시와 다름"
  - [ ] 공유 링크 생성 → 공유 화면에도 같은 뱃지
  - [ ] `npm run demo:restore -- 5` → 새로고침 → 다시 초록
  - [ ] 박임차 선택 → 1234호 리포트 4건만, 상세에 뱃지 보임
- 다음 창 주의:
  - 변조 상태에서 정산 화면을 열면 실리콘이 diff에서 빠진다(퇴거 minor = 입주 minor). 시연 순서대로 정산 → 뱃지 → 변조로 가면 문제없다. 연습 뒤에는 restore 또는 `db:init`.
  - 정산 화면에서 소액 일괄을 누르면 DB에 남는다. 다시 연습하려면 `npm run db:init`.
  - 시드 입주 리포트의 실리콘(핵심, 경미)은 사진이 없다 — 제출 규칙상 실제로는 사진이 필수지만 청구 가능성 "보통"을 재현하려고 시드에만 이렇게 넣었다(창 4 주의 참고).

### 창 8 · 보증금 공제 근거 화면 — 완료 (2026-09-26)
- 한 일:
  - 라우트 `/owner/settlement` (`name: 'owner-settlement'`, query `moveInReportId`, `moveOutReportId`) → 비교 화면(창 5)의 "보증금 공제 근거 만들기" 버튼이 자동으로 켜진다.
  - `views/SettlementView.vue`(신규): 진입 시 `POST /api/settlements`(같은 쌍이면 기존 정산), 특약 요약용으로 `GET /api/units/:id/lease`(실패해도 화면은 보임, 요약만 빠짐).
    - 상단: 입주 날짜 → 퇴거 날짜, 경과 n개월, 달라진 항목 n개.
    - 항목 카드: 구역·이름·핵심/일반, 상태 `입주 → 퇴거` 뱃지, 청구 가능성 뱃지(창 5 `diffView.js` 재사용), 부담자 3버튼(임차인 부담/임대인 부담/보류) → `PATCH .../items/:itemCode { payer }` 응답으로 다시 그림.
    - 견적 금액 입력: Enter 또는 칸을 벗어날 때 `PATCH { estimateCost }`(빈 칸 → null, 콤마·"원" 허용, 음수·소수는 빨간 문구로 막음).
    - 금액 영역: 임차인 → 금액 + `적용 기준: 계약 특약 제n항 (템플릿 제목)` + `참고: 표준 기준 n원` / `적용 기준: 표준 기준 · 잔존 n%`. 임대인 → `임대인 부담 → 수선비 장부 n원`. 보류 → `보류 · 견적 n원`(미입력이면 "미입력"). 견적이 없으면 안내 문구.
    - 고정 금액 특약 줄(`fees[]`, 청소비), `manualClauses[]` → 노란 상자 "수동 확인 필요 · 특약 제n항".
    - "5만 원 이하 항목은 임대인 부담으로 처리" → `POST .../bulk-small { threshold: 50000 }`, 바뀐 항목 이름을 안내.
    - 합계: 임차인 청구 합계 / 보증금 반환 예정(보증금 − 임차인 청구, 계약 없으면 "계약 정보 없음") / 임대인 부담 → 수선비 장부. 보류 금액이 있으면 "합계에 넣지 않았습니다" 안내.
    - 고지 문구 2개(법률 자문 아님·합의로 확정 / 특약 효력 법률 검토).
    - 임대인이 아니면 안내 문구 + 버튼·입력 비활성(백엔드도 403). `status === 'confirmed'`이면 수정 비활성(확정 API는 아직 없음).
    - `displayClauses`(표시 전용 템플릿 특약)는 화면에 넣지 않았다(1234호 시드에 없음).
  - 순수 로직 `src/lib/settlementView.js`: `PAYER_OPTIONS`, `DISCLAIMERS`, `formatWon`, `bulkSmallLabel`, `settlementRequest`, `clauseSummary`, `residualPercent`, `itemAmountView`, `feeRow`, `manualNotice`, `totalsView`, `parseCostInput`, `bulkSmallResult`. 금액 계산은 하지 않는다(백엔드 응답 그대로).
- 수정 파일: `frontend/src/views/SettlementView.vue`(신규), `src/lib/settlementView.js`(신규), `test/settlementView.test.js`(신규), `src/router/index.js`. 백엔드 변경 없음.
- 테스트: `npm test -- settlementView` → 15개 통과(순수 13 + 화면 2: 가짜 fetch로 생성·표시, 부담자 PATCH 후 합계 갱신). frontend 전체 `npm test` → **79개 통과** (64 + 신규 15). `vite build` 통과. 브라우저 화면은 사람이 확인.
- 직접 확인할 화면 (`Stop-Process -Name node -Force` → backend `npm run dev`, frontend `npm run dev`, 임대인 선택):
  - `http://localhost:5173/owner/compare` → 같은 호실의 입주 전 리포트 + 퇴거 전/후 리포트 비교 → "보증금 공제 근거 만들기" → `http://localhost:5173/owner/settlement?moveInReportId=<입주 id>&moveOutReportId=<퇴거 id>`
  - 비교 화면의 왼쪽/오른쪽 순서와 상관없이 버튼은 입주·퇴거 순서로 넘긴다.
  - 지금 시드에는 퇴거 리포트가 없어 창 3 폼으로 퇴거 점검을 만들어 제출해야 한다. 1234호가 아니면 계약이 없어 특약·보증금이 안 보인다. 오늘 날짜 퇴거면 경과 30개월 이상이라 제3항이 적용되지 않고 표준 기준으로 보인다(창 7 주의 참고).
  - 확인할 것: 부담자 버튼 → 금액·합계 즉시 변경, 견적 입력(실리콘 150,000 → 90,000), 소액 일괄 버튼, 청소비 줄, 제6항 수동 확인 상자, 고지 문구.
- 다음 창 주의 (창 9):
  - 시연 시드에 1234호 입주·퇴거 리포트(퇴거 `created_at` 2026-03-02)와 견적(벽지 480,000 · 실리콘 150,000 · 후드 필터 60,000 · 방충망 45,000)을 넣으면 이 화면에서 표의 값(770,000 / 49,230,000 / 105,000)이 바로 보인다. 방충망은 기본 부담자가 보류라 소액 일괄 버튼을 눌러야 임대인으로 간다.
  - 임대인 홈(`/owner/reports`)에서 정산 화면으로 가는 링크는 없다(비교 화면 버튼으로만 진입).

### 창 7 · 정산 계산 — 완료 (2026-09-26)
- 한 일:
  - `domain/lifespans.js`(신규): 항목 **이름**별 내구연수 예시 값(벽지 6 · 실리콘 5 · 후드 필터 8 · 방충망 5 · 바닥재 8, 그 외 기본 5). 상단에 "예시 값 · 공정위 소비자분쟁해결기준 원문 확인 필요". `lifespanYears(name)`, `LIFESPANS`, `DEFAULT_LIFESPAN_YEARS`.
    - 사용자 결정으로 내구연수는 이 파일로 통일했다. `itemCatalog.js`의 `durabilityYears` 필드와 관련 테스트를 지웠다(`GET /api/item-catalog` 응답에서도 빠짐, 프론트는 쓰지 않음).
  - `lib/settlement.js`(신규, 순수):
    - `defaultPayer(change)`: evidence `low` → `hold` / 퇴거 `minor` → `landlord`(자연 마모 후보) / 그 외 `tenant`
    - `computeSettlement({ changes, lease, items, moveInDate, moveOutDate })` — `items`는 `{ [itemCode]: { estimateCost, payer } }`, payer가 없거나 잘못되면 기본 부담자.
      - 임차인 항목: ① `applyMode:'auto'` + `kind:'full_cost'` 특약이 항목 이름·경과 월수(`elapsed.maxMonths`, inclusive)에 맞으면 견적 전액 ② 아니면 표준 `견적 × (1 − 경과 월수 ÷ (내구연수×12))`(0~1로 자름), 100원 반올림.
      - `basis`(임차인 항목만, 그 외 null): `{ type:'clause'|'standard', clauseNo, stdAmount, residual }` — `stdAmount`는 특약이 적용돼도 표준 참고 금액, `residual`은 소수 4자리.
      - `PET_DAMAGE`(kind standard + condition)는 자동 판단 데이터가 없어 적용하지 않는다(금액은 표준과 같음).
      - `fixed_fee`(CLEANING_FEE) → `fees[]` 별도 줄로 임차인 청구. `manual` 특약 → `manualClauses[]`, `display` 특약 → `displayClauses[]`(금액 반영 안 함).
      - 경과 월수 `monthsBetween`: 만 개월(일이 모자라면 −1, 음수 0).
    - `applySmallBulk(items, threshold=50000)`: 견적이 기준 이하인 항목 → `landlord`(현재 부담자와 상관없이). 견적 없는(null) 항목은 그대로. 새 배열 반환.
  - 테이블 `settlements(id, unit_id, move_in_report_id, move_out_report_id, status 'draft'|'confirmed', created_at)`, `settlement_items(id, settlement_id, item_code, estimate_cost NULL, payer 'tenant'|'landlord'|'hold', tenant_response NULL, UNIQUE(settlement_id, item_code))`. 금액·합계는 저장하지 않고 조회 때 계산한다.
  - `repositories/settlementRepo.js`(신규), `routes/settlements.js`(신규), `routes/api.js`에 `/settlements` 연결.
- API (모두 `x-user-id` 필요, 없으면 401. 조회는 그 호실 owner/tenant, **수정·생성은 그 호실 owner만** → 아니면 403. `confirmed` 정산 수정 → `400 SETTLEMENT_CONFIRMED`. 확정 API는 아직 없다):
  - `POST /api/settlements` `{ moveInReportId, moveOutReportId }` → `201 { settlement }`. 같은 쌍이 이미 있으면 `200`으로 기존 정산. diff 변경 항목마다 `settlement_items`(견적 null, 기본 부담자) 생성.
    - 리포트 없음 404 / 다른 호실 `400 UNIT_MISMATCH` / 첫째가 `move_in`, 둘째가 `move_out_pre|post`가 아니면 `400 TYPE_MISMATCH`(순서 고정).
  - `GET /api/settlements/:id` → `{ settlement }`
  - `PATCH /api/settlements/:id/items/:itemCode` `{ payer?, estimateCost? }` → `{ settlement }`. `400 INVALID_PAYER` / `400 INVALID_COST`(0 이상 정수 또는 null) / 없는 항목 404.
  - `POST /api/settlements/:id/bulk-small` `{ threshold? }`(기본 50000) → `{ settlement, changedItemCodes, threshold }`. `400 INVALID_THRESHOLD`.
  - `settlement` 응답 필드:
    `{ id, unitId, moveInReportId, moveOutReportId, status, createdAt, leaseId, moveInDate, moveOutDate, elapsedMonths,
       items: [{ itemCode, zone, name, tier, from, to, evidence, lifespanYears, estimateCost, defaultPayer, payer, tenantAmount, landlordAmount, holdAmount, basis, tenantResponse }],
       fees: [{ clauseNo, templateCode, title, text, payer:'tenant', amount }],
       manualClauses: [{ clauseNo, text }], displayClauses: [{ clauseNo, text }],
       totals: { tenantTotal, landlordTotal, holdTotal, deposit, depositReturn } }`
    - `items` 순서는 diff 순서(카탈로그 순). `tenantTotal` = 항목 임차인 금액 + fees. `landlordTotal` = 임대인 항목 견적 합(수선비 장부). `depositReturn` = 보증금 − tenantTotal(보류 금액은 빼지 않음, `holdTotal`로 따로). 계약 없으면 deposit/depositReturn null, 특약 없음.
    - `moveInDate` = 계약 시작일(계약 없으면 입주 리포트 날짜), `moveOutDate` = 퇴거 리포트 `reports.created_at` 날짜.
- 수정 파일: `backend/src/domain/lifespans.js`(신규), `src/lib/settlement.js`(신규), `src/repositories/settlementRepo.js`(신규), `src/routes/settlements.js`(신규), `src/routes/api.js`, `src/db/schema.sql`, `test/settlement.test.js`(신규), `CLAUDE.md`(API·테이블 목록), 통일 작업: `src/domain/itemCatalog.js`, `test/itemCatalog.test.js`
- 테스트: `npm test -- settlement` → 17개 통과. backend 전체 `npm test` → **182개 통과** (165 + 신규 17). `npm run db:init` 재실행 완료.
  - 시연 기준: 벽지 480,000(특약 제3항, 표준 참고 320,000) · 실리콘 견적 150,000 → 표준 90,000(잔존 60%) · 후드 필터 60,000 임대인 · 방충망 45,000 보류 → 소액 일괄 후 임대인 · 청소비 200,000 → **임차인 770,000 · 임대인 105,000 · 반환 49,230,000** (순수 함수와 API 둘 다).
- 다음 창 주의 (창 8):
  - 실리콘은 표에 "90,000"이 임차인 금액이라, 견적은 **150,000**을 넣어야 90,000이 나온다.
  - 경과 월수는 퇴거 리포트의 `created_at` 기준이다. 지금 날짜로 퇴거 리포트를 만들면 30개월 이상이 되어 제3항(24개월 이내)이 적용되지 않는다. 시연 시드(창 9)에서 퇴거 리포트 `created_at`을 2026-03-02로 넣어야 표와 같은 값이 나온다.
  - 정산 화면은 비교 화면 버튼의 query `moveInReportId`, `moveOutReportId`로 `POST /api/settlements`를 부르면 된다(같은 쌍이면 기존 정산이 온다).

### 창 6 · 계약·특약 모델 — 완료 (2026-09-26)
- 한 일:
  - 테이블 `leases(id, unit_id, owner_user_id, tenant_user_id, deposit, monthly_rent, start_date, end_date, created_at)`, `lease_clauses(id, lease_id, clause_no, template_code NULL, text, rule_json NULL, tenant_confirmed_at NULL, UNIQUE(lease_id, clause_no))`.
  - `domain/clauseTemplates.js`: `CLAUSE_TEMPLATES`(code, title, applyMode, defaultParams, defaultText, rule), `getClauseTemplate`, `buildClause(code, params)` → `{ text, rule }`(파라미터는 기본값 위에 덮어씀, 모르는 코드는 throw), `clauseApplyMode(code)`, `APPLY_MODES`.
    - rule 구조 (창 7 settlement.js가 읽는다, 여기서는 계산 안 함):
      - `WALLPAPER_FLOOR_FULL` (auto): `{ kind:'full_cost', payer:'tenant', targetItemNames:['벽지','바닥재'], elapsed:{ from:'lease_start', to:'move_out', maxMonths:24, inclusive:true } }`
      - `CLEANING_FEE` (auto): `{ kind:'fixed_fee', payer:'tenant', amount:200000 }` (params `amount`)
      - `PET_DAMAGE` (auto): `{ kind:'standard', payer:'tenant', targetItemNames:['문·문틀','바닥재','벽지'], condition:'pet_damage' }`
      - `NAIL_HOLES_ALLOW` (display): `{ kind:'display', payer:'none', maxNailHoles:5 }` (params `maxCount`)
      - `AIRCON_CLEANING` (display): `{ kind:'display', payer:'tenant', task:'aircon_cleaning' }`
    - `targetItemNames`는 카탈로그 `name`(모든 구역)과 맞춘다 — 거실·방1·방2 벽지/바닥재 모두 대상.
    - 템플릿 없는 특약 → `applyMode:'manual'`(수동 확인 필요), `rule: null`.
  - `repositories/leaseRepo.js`: `createLease(db, lease, clauses)`(템플릿이면 text 생략 시 템플릿 문장, rule_json 생성), `getLeaseByUnitId`(최근 1건), `isUnitParty`.
  - 시드: 1234호 계약(보증금 50,000,000 · 월세 1,200,000 · 2024-03-02~2026-03-02), 제3항 WALLPAPER_FLOOR_FULL, 제4항 CLEANING_FEE(200,000), 제6항 자유 문장, 모두 `tenant_confirmed_at='2024-02-20'`. 345호는 계약 없음.
- API: `GET /api/units/:id/lease` — 그 호실의 owner/tenant(`unit_users` 기준)만. 시공업자·다른 호실 → `403 FORBIDDEN`, 헤더 없음 → `401`, 권한 있지만 계약 없음 → `404`.
  - 응답 `{ lease: { id, unitId, ownerUserId, tenantUserId, deposit, monthlyRent, startDate, endDate, clauses: [{ id, clauseNo, text, templateCode, templateTitle, applyMode:'auto'|'display'|'manual', rule, tenantConfirmedAt }] } }` (clauseNo 순)
- 수정 파일: `backend/src/db/schema.sql`, `src/db/seed.js`, `src/routes/api.js`, `src/domain/clauseTemplates.js`(신규), `src/repositories/leaseRepo.js`(신규), `test/lease.test.js`(신규), `CLAUDE.md`(DB 테이블 목록)
- 테스트: `npm test -- lease` → 12개 통과. backend 전체 `npm test` → **165개 통과** (153 + 신규 12). `npm run db:init` 재실행 완료.
- 다음 창 주의 (창 7):
  - 경과 월수는 `lease.startDate` → 퇴거 리포트 날짜로 계산한다. 시연값 2024-03-02 → 2026-03-02 = 24개월, `inclusive:true`라 제3항 적용.
  - 특약 우선 적용 대상은 `applyMode === 'auto'`만. `display`는 표시, `manual`(제6항)은 "수동 확인 필요" 목록으로.
  - `PET_DAMAGE`의 `condition:'pet_damage'`는 자동 판단할 데이터가 없다(사람이 정산 화면에서 표시해야 적용).

### 창 5 · 입주-퇴거 비교 화면 — 완료 (2026-09-26)
- 한 일:
  - `ReportCompareView.vue`: 응답에 `diff`가 있으면(입주 전↔퇴거) `DiffView`, 없으면 기존 좌우 비교. `diff`가 있을 때만 `GET /api/item-catalog`를 한 번 불러 변경 없는 항목 목록에 쓴다(실패해도 비교는 표시). 안내 문구에 "입주 전/퇴거" 예외 추가.
  - `components/DiffView.vue`(신규, props `result`, `catalog`):
    - 상단: 호실, `입주 날짜 → 퇴거 유형 날짜`(스냅샷 `generatedAt` 날짜), "같은 호실", `변경 n · 변경 없음 n`
    - 변경 항목 카드: 구역 · 이름 · 핵심/일반, 상태 `입주 → 퇴거` 색 뱃지(정상 초록/경미 청록/손상 주황/파손 빨강/기록 없음 회색), 청구 가능성 높음/보통/낮음 뱃지, 입주·퇴거 사진 나란히.
    - 입주 사진 칸: 항목 사진 → 없으면 같은 구역 전경 사진("구역 전경" 표시) → 없으면 `입주 기록 없음`(from unknown) / `입주 사진 없음 · 양측 확인 기록 있음`(evidence mid) / `입주 사진 없음`.
    - 변경 없는 항목은 `<details>` 접힌 목록(구역별 이름).
    - "보증금 공제 근거 만들기": 라우트 이름 `owner-settlement`가 있으면 `{ moveInReportId, moveOutReportId }` query로 이동, 없으면 비활성 + "정산 화면은 아직 준비 중입니다."
  - 순수 로직 `src/lib/diffView.js`: `stateBadge`, `evidenceBadge`, `tierLabel`, `sortChanges`(퇴거 상태 나쁜 순 → 구역 순서 → 카탈로그 순), `summaryCounts`, `pickSnapshots`(좌우 순서 무관), `formatDate`, `moveInPhotoCell`, `moveOutPhotoCell`, `unchangedByZone`, `settlementButton`, `SETTLEMENT_ROUTE`.
- 수정 파일: `frontend/src/views/ReportCompareView.vue`, `src/components/DiffView.vue`(신규), `src/lib/diffView.js`(신규), `test/diffView.test.js`(신규). 백엔드 변경 없음.
- 테스트: `npm test -- diffView` → 18개 통과. frontend 전체 `npm test` → **64개 통과** (46 + 신규 18). `vite build` 통과. 브라우저 화면은 사람이 확인.
- 직접 확인할 화면: 임대인 선택 → `/owner/compare`에서 같은 호실의 입주 전 리포트와 퇴거 전/후 리포트 선택 → 비교. 지금 시드에는 퇴거 리포트가 없어서, 창 3 폼으로 퇴거 점검을 만들어 제출해야 볼 수 있다(시연 시드는 창 9).
- 다음 창 주의:
  - **창 8은 정산 화면 라우트를 `name: 'owner-settlement'`으로 추가**하고 query `moveInReportId`, `moveOutReportId`를 받으면 비교 화면 버튼이 자동으로 켜진다(이름을 바꾸면 `diffView.js`의 `SETTLEMENT_ROUTE`도 함께).
  - 청구 가능성 뱃지는 백엔드 `evidence` 그대로다. 창 4 주의대로 지금 실제 리포트는 대부분 `낮음`(항목 사진 있으면 `높음`)으로 보인다.

### 창 4 · 입주-퇴거 비교 로직 — 완료 (2026-09-25)
- 한 일:
  - `lib/compare.js`: 같은 호실 조건 유지. 허용 조합에 `move_in` ↔ `move_out_pre`/`move_out_post`(순서 무관) 추가. 반환에 `isBaselinePair` 추가(수리 전/후·같은 유형이면 false). 퇴거 전↔퇴거 후는 여전히 `TYPE_MISMATCH`. `isMoveInMoveOutPair(a, b)` export.
  - `lib/diff.js`(신규) `diffBaseline(moveInSnapshot, moveOutSnapshot, catalog)`: 카탈로그 40개를 모두 돈다.
    - 스냅샷 `items`(item_code 있는 것만)에 기록이 없으면: 그 구역이 `zoneConfirmations`에 있으면(역할 무관) `normal`, 없으면 `'unknown'`.
    - 순위 normal < minor < damaged < broken, 퇴거가 더 나쁘면 변경. 입주 `unknown`이면 퇴거가 minor 이상일 때 변경. 퇴거 `unknown`은 변경이 아니다(`unchangedCount`에 포함).
    - `evidence`: `'high'` 입주 때 그 항목 사진 있음 또는 (구역 tenant 확인 + 구역 전경 사진 `images[].zone`, item_id 없음) / `'mid'` 구역 tenant 확인 / `'low'` tenant 미확인 또는 입주 `unknown`.
  - `GET /api/reports/compare` 응답 (기존 `left`, `right`, `compareMeta`, `validation` 유지):
    - `compareMeta.isBaselinePair`, `validation.isBaselinePair` (boolean)
    - `diff`: baseline 조합이 아니면 `null`. 조합이면 좌우 순서와 상관없이 입주 쪽 기준으로
      `{ moveInReportId, moveOutReportId, changes: [{ itemCode, zone, name, tier, from, to, evidence, moveInImages, moveOutImages }], unchangedCount }`
      - `from`/`to`: `normal|minor|damaged|broken|unknown` (`to`는 unknown이 나오지 않음)
      - `evidence`: `high|mid|low`
      - `moveInImages`/`moveOutImages`: 그 스냅샷의 **항목 사진**(`item_id` 일치) 객체 그대로(`id, item_id, zone, kind, caption, byte_size, data_base64`). 구역 전경 사진은 넣지 않는다(필요하면 `left/right.images`에서 `zone`으로 찾는다).
      - `unchangedCount` = 40 − `changes.length`
  - CLAUDE.md: "Scheduled to change"의 Report comparison을 invariants로 옮기고 새 규칙으로 고침.
- 수정 파일: `backend/src/lib/compare.js`, `backend/src/lib/diff.js`(신규), `backend/src/routes/reports.js`, `backend/test/compare.test.js`, `backend/test/diff.test.js`(신규), `CLAUDE.md`
- 테스트: `npm test -- diff compare` → 26개 통과. backend 전체 `npm test` → **153개 통과** (138 + 신규 15). 시연 데이터 4건(벽지 high · 실리콘 mid · 후드 필터 high · 방충망 low) → changes 4개, unchangedCount 36.
- 다음 창 주의:
  - evidence의 "tenant 확인"은 `zone_confirmations.role='tenant'`로 판단한다. 지금은 API가 author 확인만 저장하므로 실제 리포트는 모두 `low`(항목 사진이 있으면 `high`)가 나온다. 시연 값(high/mid)을 재현하려면 창 9 시드에서 입주 리포트에 tenant 구역 확인·구역 전경 사진을 넣어야 한다.
  - 시연 데이터의 실리콘(핵심 항목) 입주 "경미"는 제출 규칙상 사진이 필수라, 실제 제출된 리포트에서는 항목 사진 때문에 `high`가 된다. `mid`로 보이려면 시드에 직접 넣거나(사진 없이) 규칙 해석을 정해야 한다. diff 테스트는 손으로 만든 스냅샷이라 `mid`가 나온다.
  - progress.md의 "양측 확인 = report_confirmations" 결정과 달리, 이번 창은 사용자 지시대로 구역 단위 tenant 확인을 썼다.

### 창 3 보완 · 항목 사진 칸 5장 제한 + 정상 복귀 시 사진 제거 — 완료 (2026-09-25)
- 한 일: baseline 폼의 항목별 사진 칸이 `(n/20)`으로 보이고 6장째도 추가돼, 백엔드 `400 IMAGE_ITEM_LIMIT` 후 한 장을 지울 때까지 저장이 계속 실패했다. `PhotoUploader`에 `max` prop(기본 20)을 추가하고, 항목 사진 칸은 `MAX_IMAGES_PER_ITEM`(5)으로 표시·차단한다(“이 항목의 사진은 최대 5장입니다.”). `canAddMore`에 `max` 인자 추가.
- 수정 파일: `src/lib/image.js`, `src/components/PhotoUploader.vue`, `src/components/BaselineInspectionForm.vue`, `test/image.test.js`, `test/photoUploader.test.js`. 백엔드 변경 없음.
- 테스트: frontend 전체 `npm test` → **42개 통과** (40 + 신규 2). `vite build` 통과.
- 추가: 정상으로 되돌렸다가 다시 이상으로 바꾸면 저장에서 빠졌던 사진이 화면에 되살아나던 문제 수정. `setItemState`(정상으로 바꿀 때)와 `confirmZone`(그 구역 항목)이 폼 모델의 항목 사진을 버린다. 이상 단계끼리 바꿀 때(경미→손상 등)는 사진을 유지한다. 메모는 그대로 둔다(일괄 확인은 기존대로 메모도 지움).
- 테스트(추가 후): frontend 전체 `npm test` → **46개 통과** (42 + 신규 4).

### 창 3 · 이상 항목 기록 점검 폼 — 완료 (2026-09-25)
- 한 일:
  - `InspectionEdit.vue`: flow가 `baseline`이면 `GET /api/item-catalog`를 불러 `BaselineInspectionForm`을 쓴다. whole/issue는 기존 폼 + 공통 사진 업로더 그대로. baseline에서는 공통 사진 업로더를 숨긴다(사진 PATCH는 전체 교체라 항목 사진이 지워지므로 폼이 사진 전체를 한 번에 보낸다).
  - 제출 버튼은 baseline 폼의 현재 입력(`getPayload()`)과 최종 의견을 함께 PATCH한 뒤 제출한다. 백엔드 400 메시지(`ZONES_NOT_CONFIRMED`, `PHOTO_REQUIRED`)는 그대로 빨간 박스에 보인다. 프론트에서 제출을 막지 않고 요약 아래에 경고만 띄운다.
  - `BaselineInspectionForm.vue`(신규): 구역 탭 7개(탭에 "✓ 확인" / "이상 n"), "이 구역 이상 없음 · 한 번에 확인"(이상 항목이 있으면 확인 창), 항목마다 정상/경미/손상/파손 + 핵심/일반 뱃지, 이상 항목은 메모 칸 + 사진 칸(`PhotoUploader` 재사용). 핵심 항목이면 "사진 필수"(사진 없으면 빨간색). 하단 고정 요약: `항목 40 · 구역 확인 n/7 · 이상 n · 사진 n` + 미확인 구역·사진 필요한 항목.
  - 순수 로직 `src/lib/baselineInspection.js`: `fromInspection`, `confirmZone`, `setItemState`(이상으로 바꾸면 그 구역 확인 해제), `needsPhoto`, `missingPhotoItems`, `zoneStatus`, `summarize`, `buildSavePayload`(이상 항목만, 사진은 `itemCode`로 연결).
  - "구역 확인 n/7"은 백엔드 제출 규칙과 같게 셌다: "이상 없음" 확인 또는 이상 항목이 있는 구역.
  - 정상으로 되돌린 항목의 사진은 저장하지 않는다. 항목에 연결되지 않은 사진(구역 전경 등)은 편집 UI 없이 그대로 다시 보내서 보존한다.
  - 프론트 `domain/inspectionTypes.js` flow: 입주 전·퇴거 전·퇴거 후 → `baseline`. `NewInspection`은 선택한 유형의 작성 방식 안내 한 줄만 추가했다(작성 화면은 기존처럼 InspectionEdit로 이동).
  - `PhotoUploader`에 `title` prop(기본 "사진 첨부"). `image.fromInspectionImages`는 업로더 모델(`dataBase64`)도 받는다.
  - 리포트 상태 라벨(`reportView.stateLabel`)에 `damaged` 손상 · `broken` 파손 추가(제출한 baseline 리포트가 코드 그대로 보이지 않도록).
  - `inspectionSpaces.js`는 이미 "화장실"이라 고칠 것이 없었다.
- 수정 파일: `frontend/src/components/BaselineInspectionForm.vue`(신규), `src/lib/baselineInspection.js`(신규), `test/baselineInspection.test.js`(신규), `src/views/InspectionEdit.vue`, `src/views/NewInspection.vue`, `src/components/PhotoUploader.vue`, `src/domain/inspectionTypes.js`, `src/lib/image.js`, `src/lib/reportView.js`. 백엔드 변경 없음.
- 테스트: `npm test -- baselineInspection` → 11개 통과. frontend 전체 `npm test` → **40개 통과** (29 + 신규 11). `vite build` 통과.
  - 프론트 로직으로 만든 페이로드를 백엔드 in-memory 앱에 보내 확인(임시 테스트, 커밋 안 함): 퇴거 후 점검 생성 → 7개 구역 확인 + 거실 벽지 손상 저장 → 제출 `400 핵심 항목에 이상이 있으면 사진이 필요합니다: 거실 벽지` → 사진 추가 저장 → 제출 `201`.
- 직접 확인할 화면 (`Stop-Process -Name node -Force` → backend `npm run dev`, frontend `npm run dev`, 사용자 "이시공(시공업자)" 선택):
  - `http://localhost:5173/contractor/inspections/new` → "퇴거 후 점검" 또는 "입주 전 점검" 선택 → 점검 시작 → `/contractor/inspections/:id`에서 새 폼
  - 시드의 345호 작성 중 입주 전 점검(거실 창호 경미, 현관·주방 확인): 시공업자 홈 `/contractor`의 작성 중 목록에서 열기
  - 확인할 것: 탭 표시, 구역 일괄 확인, 핵심 항목 이상 → 사진 필수, 요약 숫자, 사진 없이 제출 시 백엔드 400 문구, 사진 넣고 제출 → 리포트 생성
- 다음 창 주의:
  - 구역 전경 사진 필수(새 설계 규칙)는 아직 백엔드 검증도, 폼 입력 칸도 없다. 필요하면 별도 창에서 백엔드 규칙과 함께 넣는다.

### 창 2 보완 · 항목 수정 시 사진 보존 — 완료 (2026-09-25)
- 한 일: `PATCH`에 `items`만 보내면 항목을 지웠다 다시 넣으면서 FK CASCADE로 항목 사진까지 지워졌다(1학기부터 있던 동작). 핵심 항목 사진 필수 규칙과 부딪혀 "사진 저장 → 항목 수정 → 제출"이 `PHOTO_REQUIRED`로 막혔다.
  - `inspectionRepo.updateInspection`: `images` 없이 `items`만 오면 `item_code`가 있는 항목의 사진을 떼어 뒀다가 같은 코드의 새 항목에 다시 연결한다. 정상으로 바뀌어 빠진 항목의 사진은 연결 없이(item_id NULL) 남는다. whole/issue 동작은 그대로다.
- 수정 파일: `repositories/inspectionRepo.js`, `test/baseline.test.js`
- 테스트: backend 전체 `npm test` → **138개 통과** (136 + 신규 2)
- 남은 점(경미): 유형을 baseline ↔ whole/issue로 바꾸면 기존 항목 상태가 새 흐름과 맞지 않는다. 화면에서 유형을 바꾸지 않으면 시연 영향 없음.

### 창 2 · baseline 점검 흐름 — 완료 (2026-09-25)
- 한 일:
  - 입주 전·퇴거 전·퇴거 후 → `flow='baseline'` (정기=whole, 긴급·수리 전/후=issue 유지). `inspections.flow` CHECK에 baseline 추가.
  - 상태 `normal/minor/damaged/broken`, 기본 normal. **정상 항목은 저장하지 않는다.** `category`/`name`은 카탈로그의 zone/name으로 서버가 채운다.
  - 새 테이블 `zone_confirmations(inspection_id, zone, role 'author'|'owner'|'tenant', confirmed_at, UNIQUE(inspection_id, zone, role))`.
  - `inspection_images.zone` 컬럼 추가 (구역 전경 사진). 전경 사진 필수 검증은 아직 없다(창 2 범위 밖).
  - 순수 로직 `backend/src/lib/baseline.js`: `normalizeBaselineInput`, `normalizeZones`, `validateBaselineSubmission`, `BASELINE_STATES`
  - `grading.computeBaselineGrade`: A 이상 없음 / B 경미만 / C 손상 1~2 / D 손상 3+ 또는 파손 1 / E 파손 2+
  - 스냅샷에 `zoneConfirmations` 추가. `items`에는 `item_code`, `images`에는 `zone`이 들어간다.
  - 시드: 345호 입주 전 리포트 → baseline(7개 구역 확인, A). 345호 작성 중 입주 전 → baseline(거실 창호 경미, 현관·주방 확인).
- API 계약 (baseline 점검, 창 3 프론트용):
  - `POST /api/inspections`, `PATCH /api/inspections/:id` 본문:
    - `items: [{ itemCode, state, location?, description? }]` — 정상은 보내도 버린다. 잘못된 코드 → `400 INVALID_ITEM_CODE`, 중복 → `400 DUPLICATE_ITEM_CODE`, 잘못된 상태 → `400 INVALID_STATE`
    - `images: [{ dataBase64, itemIndex? | itemCode?, zone?, kind?, caption? }]` — `itemCode`로 항목을 가리킬 수 있고, 사진만 PATCH해도 저장된 항목에 연결된다. 반대로 항목만 PATCH해도 사진은 같은 `itemCode` 항목에 남는다. 잘못된 구역 → `400 INVALID_ZONE`
    - `zonesConfirmed: ['현관', ...]` — 보내면 작성자(author) 구역 확인을 교체한다.
  - 응답 `inspection.zoneConfirmations: [{ zone, role, confirmed_at }]`, `inspection.images[].zone`
  - 제출 검증 (`POST /:id/submit`, baseline만):
    - 구역마다 "이상 없음" 확인 또는 이상 항목 1개 이상. 아니면 `400 ZONES_NOT_CONFIRMED` (메시지에 빠진 구역 이름)
    - 핵심 항목이 정상이 아니면 그 항목 사진 1장 이상. 아니면 `400 PHOTO_REQUIRED` (메시지에 항목 이름)
- 수정 파일: `domain/inspectionTypes.js`, `lib/grading.js`, `lib/baseline.js`(신규), `db/schema.sql`, `db/seed.js`, `repositories/inspectionRepo.js`, `repositories/reportRepo.js`, `routes/inspections.js`, `test/baseline.test.js`(신규), `CLAUDE.md`
- 테스트: backend 전체 `npm test` → **136개 통과** (115 + 신규 21). `npm run db:init` 재실행 완료.
- 다음 창 주의:
  - 프론트 `InspectionEdit.vue`는 flow가 whole이 아니면 IssueInspectionForm을 보여 준다. 그래서 창 3 전까지 입주·퇴거 점검은 옛 문제 항목 폼으로 열린다(저장 시 itemCode가 없어 400).
  - 프론트 `domain/inspectionTypes.js`의 flow 값도 창 3에서 baseline으로 맞춘다.
  - 창 4 diff: 스냅샷 `items`에는 이상 항목만 있다. 기록이 없는 항목은 `zoneConfirmations`로 normal/unknown을 판단한다.

### 창 1 · 항목 코드 카탈로그 — 완료 (2026-09-25)
- 한 일:
  - `itemCatalog.js`: 7개 구역(현관·거실·주방·화장실·방1·방2·베란다), 40개 항목(핵심 25·일반 15). 필드는 `code, zone, name, tier('core'|'general'), durabilityYears`. 헬퍼는 `ZONES`, `ITEM_CATALOG`, `getItem(code)`, `itemsByZone()`.
  - `inspection_items.item_code TEXT` (NULL 허용). `inspectionRepo.insertItems`와 시드가 `itemCode`를 받으면 저장한다. whole/issue 흐름·등급은 그대로다.
  - `GET /api/item-catalog` (인증 불필요) → `{ zones, items }`
  - 시드 호실을 1234호(노원 그린아파트, 임차인 연결)·345호(강남 햇살빌라)로 바꿨다.
- 수정 파일: `backend/src/domain/itemCatalog.js`(신규), `db/schema.sql`, `db/seed.js`, `repositories/inspectionRepo.js`, `routes/api.js`, `test/itemCatalog.test.js`(신규), 호실 이름·개수 때문에 `test/{api,compare,db,reports}.test.js`
- 테스트: backend 전체 `npm test` → **115개 통과** (107 + 신규 8). `npm run db:init` 재실행 완료.
- 다음 창 주의: 기준선 항목은 `item_code`로 저장한다(`items[].itemCode`). 구역 이름은 카탈로그의 `zone`과 같아야 한다(화장실).
