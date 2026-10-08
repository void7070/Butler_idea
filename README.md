# Butler (버틀러) — 임대차 입주·퇴거 기록과 보증금 정산

1학기 "스마트 점검 리포트"(Vue 3 + Express + SQLite) 위에 버틀러 아이디어를 실제로 돌아가게 붙인 PoC.
입주 때 남긴 기록과 퇴거 때 기록을 자동으로 비교하고, 항목마다 누가 낼지 정해 보증금 공제 근거를 만든다.
임차인은 앱 설치 없이 링크로 동의·이의하고, 발행된 리포트·확정된 정산서는 해시로 잠긴다.

> 작업 규칙·아키텍처 불변 규칙은 `CLAUDE.md`, 창별 진행 기록은 `progress.md`,
> 실행 명령어 정리는 `실행방법.md` 참고.

## 핵심 원칙

- **AI가 판단하지 않는다.** 비교·정산은 규칙(항목 코드, 특약, 표준 감가)으로만 계산한다. 원인 판단이 필요한 특약(반려동물 등)은 "해당 가능"만 띄우고 임대인이 확인한다.
- **기록은 고칠 수 없다.** 리포트는 발행 시, 정산서는 합의 확정 시 스냅샷 + SHA-256 해시로 동결. DB를 직접 바꾸면 "변경 감지".
- **비율이 아니라 항목별 부담자.** 우선순위: 계약 특약 > 입주 기준선 > 표준 감가.
- **판단은 사람이.** 정산은 임차인 이의가 하나라도 있으면 멈추고, 모두 합의돼야 확정된다.

## 주요 기능

| 기능 | 내용 |
|---|---|
| 임대인 홈 · 오늘 할 일 | 계약 종료, 입주 제보 마감, 특약 확인, 전월세 신고 기한을 급한 순으로. 누르면 그 화면으로 |
| 점검 폼 | 구역 7개 · 항목 40개(항목 코드). 기본값 정상, 구역별 "이상 없음 한 번에 확인", 이상 항목만 사진 |
| 입주–퇴거 비교 | 40개 중 달라진 항목만 추출 + 입주 기록 강도에 따른 청구 가능성(높음/보통/낮음) |
| 계약·특약 | 특약 템플릿 선택 → 정산에 자동 적용, 직접 입력 특약은 "수동 확인", 임차인 특약 확인 |
| 보증금 공제 근거(정산) | 항목별 부담자·금액·적용 근거, 소액 일괄 임대인 부담, 조건부 특약(반려동물) 체크 |
| 임차인 링크 응답 | 로그인 없이 항목마다 동의/이의(1회, 수정 불가). 이의 시 정산 보류. 링크 화면은 이름 가림 |
| 합의 확정 · 동결 | 확정 정산서 스냅샷 + 해시, 임대인·임차인 화면 모두 검증 뱃지 |
| 입주 제보 | 입주 후 7일간 임차인이 구역 확인·이상 제보 → 임대인 승인분만 입주 기준선에 반영 |
| 수선비 장부 · CSV | 확정된 임대인 부담 항목을 호실·연도별로, 사유와 함께 CSV(엑셀 한글 OK) |
| 분쟁 대비 증빙 자료 | 계약·특약 원문, 입주 기준선, 항목별 사진 비교, 응답 이력, 해시 검증을 인쇄/PDF 한 묶음으로 |
| House Log | 호실별 계약·점검·제보·정산·장부·수리 기록 타임라인 + 해시 검증 요약 |
| 다음 입주 기준선 | 퇴거 리포트를 다음 입주 점검으로 가져오기("수리 확인 필요" 표시) |
| 수리 전·후 점검 | 항목마다 사진 1장 이상이어야 제출, 수리 후 ↔ 수리 전 리포트 연결, House Log "수리 완료" → 전후 비교 |

## 기술 스택

| 영역 | 스택 |
|---|---|
| 프론트엔드 | Vue 3 + Vite + Tailwind CSS v4 + Vue Router |
| 백엔드 | Node.js + Express 5 |
| DB | SQLite + better-sqlite3 |
| AI | GPT API (OpenAI) — 점검 도우미에만 사용, 키 없으면 기본 템플릿 폴백. 비교·정산에는 쓰지 않음 |
| 테스트 | Vitest (양쪽), supertest (백엔드 API) |

요구사항: **Node.js 20+** (권장 24 — 백엔드 dev가 네이티브 `--watch` 사용).

## 프로젝트 구조

```
.
├─ backend/        Express API 서버 (포트 3000)
│   ├─ src/
│   │   ├─ domain/       항목 카탈로그·특약 템플릿·내구연수·점검 유형
│   │   ├─ lib/          순수 로직 (diff, settlement, snapshotHash, houseLog, repairGate, maskName …)
│   │   ├─ routes/       reports · settlements · inspections · owner · houseLog · carryover …
│   │   ├─ repositories/ DB 접근
│   │   └─ db/           schema.sql · seed.js · reset.js · demoPet.js
│   ├─ scripts/    demo:reset / demo:pet / demo:tamper 등 시연 스크립트
│   └─ test/       Vitest (321 테스트)
├─ frontend/       Vue 3 앱 (포트 5173)
│   ├─ src/        views · components · stores · lib · router
│   └─ test/       Vitest (170 테스트)
├─ CLAUDE.md       작업 규칙 / 아키텍처 불변 규칙
├─ progress.md     창별 진행 체크리스트
├─ 실행방법.md     실행 명령어 정리
└─ run.bat         백엔드·프론트 한 번에 실행 (Windows)
```

## 실행 방법 (Windows PowerShell)

최초 1회:

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run db:init            # SQLite 스키마 + 시연 데이터 (app.db)
cd ..\frontend
npm install
```

실행: **`run.bat` 더블클릭** (예전 node 프로세스를 정리하고 백엔드·프론트 창을 띄운다) 또는 각각

```powershell
cd backend ; npm run dev   # http://localhost:3000
cd frontend ; npm run dev  # http://localhost:5173
```

브라우저에서 **http://localhost:5173** 접속. 확인: http://localhost:3000/api/health

- `backend/.env`의 `DEMO_TODAY=2026-09-27`처럼 시연 기준일을 고정하면 D-day·홈 날짜가 매번 같다(바꾼 뒤 백엔드 재시작 + `demo:reset`).
- 다른 PC에서 받은 뒤 옛 `app.db`가 있으면 스키마가 다를 수 있으니 `npm run demo:reset`을 한 번 한다.

## 시연 스크립트 (backend)

| 명령어 | 설명 |
|---|---|
| `npm run demo:reset` | 서버를 켠 채로 스키마·시드 재생성 (연습 뒤 초기화) |
| `npm run db:init` | DB 파일을 지우고 새로 생성 (서버를 끈 뒤에만) |
| `npm run demo:pet` | 1234호 계약에 반려동물 특약 제5항 추가 (되돌리기: `demo:reset`) |
| `npm run demo:tamper -- 5` / `demo:restore -- 5` | 리포트 5를 DB에서 몰래 변조 / 복구 |
| `npm run demo:tamper-settlement -- 1` / `demo:restore-settlement -- 1` | 확정 정산서 1 변조 / 복구 |

## 시연 데이터

- 사용자 4: **이시공**(시공업자) · **김임대**(임대인) · **박임차**(1234호 임차인) · **최임차**(345호 임차인)
- **노원 그린아파트 1234호**: 계약 2024-03-02 ~ 2026-03-02, 보증금 5,000만 원, 특약 제3·4·6항.
  입주 전 리포트 **id 4**(B) ↔ 퇴거 후 리포트 **id 5**(D) → 달라진 항목 4개
  (벽지 480,000 · 실리콘 · 후드 필터 60,000 · 방충망 45,000)
- **강남 햇살빌라 345호**: 기준일 − 2일 시작 계약, 입주 전 리포트 **id 6**(A) → 입주 제보 기간 D-5
- 시연 기준 값: 소액 일괄 처리 후 **임차인 청구 770,000원 · 임대인 부담 105,000원 · 보증금 반환 49,230,000원**

시연 순서 (김임대로 시작):

1. 홈 "오늘 할 일" → 1234호 퇴거 카드
2. 입주 전(B) ↔ 퇴거 후(D) 비교 → 변경 4 · 변경 없음 36
3. "보증금 공제 근거 만들기" → "5만 원 이하 항목은 임대인 부담으로 처리" → 770,000원
4. "임차인 응답 링크 만들기" → 링크를 새 창에서 열어 동의(또는 이의 → 정산 보류)
5. "합의 확정" → 정산서 동결 뱃지 → 수선비 장부 · CSV → 1234호 House Log
6. 리포트 5 상세 → `npm run demo:tamper -- 5` → "변경 감지" → `npm run demo:restore -- 5`

연습 뒤에는 `npm run demo:reset`.

## 테스트

```powershell
cd backend ; npm test      # 321 (logic + API)
cd frontend ; npm test     # 170 (logic + component)
```

비교·정산·해시·마감 계산·이름 가림 같은 핵심 로직은 순수 함수로 분리해 단위 테스트하고,
API는 supertest + in-memory SQLite로 권한·오류 코드까지 검증한다.

## API 응답 형식

```jsonc
{ "success": true,  "data": { /* ... */ } }                      // 성공
{ "success": false, "error": { "code": "...", "message": "..." } } // 실패
```

데모 인증: 로그인 없이 `x-user-id` 헤더로 사용자를 식별하고, 권한은 **백엔드가 DB 기준으로** 판단한다.
공유 링크(`/api/share/...`)는 토큰으로만 열리고 7일 뒤 만료된다.

## 실제 동작 vs 목업

실제 동작: 위 "주요 기능" 표 전부.
목업(구현 아님): 소유권 인증·본인인증, 알림톡 발송, 법정 기한 캘린더, 주변 월세 분포, 호실 채널, 시공 중 사진·업체 배정.
