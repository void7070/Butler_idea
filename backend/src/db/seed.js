import { flowForType } from '../domain/inspectionTypes.js';
import { computeGrade } from '../lib/grading.js';
import { createInspection, getInspectionById } from '../repositories/inspectionRepo.js';
import { buildSnapshot, insertSnapshot, getSnapshotByReportId } from '../repositories/reportRepo.js';
import { ZONES, ITEM_CATALOG, getItem } from '../domain/itemCatalog.js';
import { createLease } from '../repositories/leaseRepo.js';
import { createSettlement } from '../repositories/settlementRepo.js';
import { diffBaseline } from '../lib/diff.js';
import { defaultPayer } from '../lib/settlement.js';
import { createTenantReport, decideTenantReport } from '../repositories/tenantReportRepo.js';
import { toDateString } from '../lib/tenantReport.js';
import { sqlDateTime } from '../lib/demoClock.js';
import { serverNow } from '../config.js';

/**
 * 데모 seed 데이터. (백엔드_PRD §4 수량 기준)
 * 사용자 4, 건물 2, 호실 2(1234호·345호), 기존 리포트 3, 작성 중 1, 제출 대기 1,
 * 1234호 계약 1건(특약 제3·4·6항), 발표 시연용 1234호 입주·퇴거 리포트 2개 + 정산 초안 1건(창 9),
 * 입주 제보 시연용 345호 계약(시작 = 기준일 − 2일, 창 17) + 입주 전 리포트 1개(창 13, 리포트 id 6).
 *
 * 비교 시연을 위해 1234호 정기점검 리포트 2개(B·A 등급)를 만들어 둔다
 * → 같은 호실 + 같은 유형이므로 /api/reports/compare 로 비교 가능.
 *
 * @param {object} [opts]
 * @param {Date} [opts.now] 345호 계약 시작일·기존 리포트 3개 발행 시각 기준
 *   (생략 시 서버의 "지금" = DEMO_TODAY 기준일 + 실제 시각(창 17), 테스트는 주입)
 */
export function seed(db, { now = serverNow() } = {}) {
  const seededAt = sqlDateTime(now);
  const run = db.transaction(() => {
    // --- users ---
    const insUser = db.prepare('INSERT INTO users (name, role, org) VALUES (?, ?, ?)');
    const contractorId = insUser.run('이시공', 'contractor', '믿음시공').lastInsertRowid;
    const ownerId = insUser.run('김임대', 'owner', null).lastInsertRowid;
    const tenantId = insUser.run('박임차', 'tenant', null).lastInsertRowid;
    const tenant345Id = insUser.run('최임차', 'tenant', null).lastInsertRowid;

    // --- buildings ---
    const insBuilding = db.prepare('INSERT INTO buildings (name, address) VALUES (?, ?)');
    const b1 = insBuilding.run('노원 그린아파트', '서울 노원구 ...').lastInsertRowid;
    const b2 = insBuilding.run('강남 햇살빌라', '서울 강남구 ...').lastInsertRowid;

    // --- units ---
    const insUnit = db.prepare('INSERT INTO units (building_id, name) VALUES (?, ?)');
    const u1234 = insUnit.run(b1, '1234호').lastInsertRowid;
    const u345 = insUnit.run(b2, '345호').lastInsertRowid;

    // --- unit_users (owner는 2호실 전부, tenant는 1234호) ---
    const insUU = db.prepare('INSERT INTO unit_users (unit_id, user_id, role) VALUES (?, ?, ?)');
    for (const uid of [u1234, u345]) insUU.run(uid, ownerId, 'owner');
    insUU.run(u1234, tenantId, 'tenant');
    insUU.run(u345, tenant345Id, 'tenant');

    // --- 1234호 임대차 계약 + 특약 (창 6, 시연 기준 데이터) ---
    const confirmedAt = '2024-02-20';
    createLease(
      db,
      {
        unitId: u1234,
        ownerUserId: ownerId,
        tenantUserId: tenantId,
        deposit: 50_000_000,
        monthlyRent: 1_200_000,
        startDate: '2024-03-02',
        endDate: '2026-03-02',
      },
      [
        { clauseNo: 3, templateCode: 'WALLPAPER_FLOOR_FULL', tenantConfirmedAt: confirmedAt },
        { clauseNo: 4, templateCode: 'CLEANING_FEE', params: { amount: 200_000 }, tenantConfirmedAt: confirmedAt },
        {
          clauseNo: 6,
          text: '그 밖의 파손은 임대인과 임차인이 협의하여 정한다.',
          tenantConfirmedAt: confirmedAt,
        },
      ]
    );

    // --- 기존 리포트 3개 (항목 포함, 등급은 항목에서 산출) ---
    // R1: 1234 정기점검 — 거실 창호 주의 1건 → B등급
    createReport(db, {
      unitId: u1234,
      createdBy: contractorId,
      type: 'periodic',
      createdAt: '2024-09-02 10:00:00', // 1234호 계약(2024-03-02~2026-03-02) 중 정기 점검
      opinion: '전반적으로 양호하나 거실 창호 실리콘 들뜸 1건 확인. 경과 관찰 권장합니다.',
      items: [
        { category: '현관', name: '현관문', state: 'normal' },
        { category: '거실', name: '창호', state: 'caution', location: '베란다측 창', description: '실리콘 들뜸' },
        { category: '주방', name: '수전', state: 'normal' },
        { category: '화장실', name: '변기', state: 'normal' },
      ],
    });
    // R2: 1234 정기점검 — 전부 정상 → A등급 (R1과 비교 시연용)
    createReport(db, {
      unitId: u1234,
      createdBy: contractorId,
      type: 'periodic',
      createdAt: '2025-09-01 10:00:00', // 1234호 계약 중 정기 점검
      opinion: '모든 항목 정상. 특이사항 없습니다.',
      items: [
        { category: '현관', name: '현관문', state: 'normal' },
        { category: '거실', name: '창호', state: 'normal' },
        { category: '주방', name: '수전', state: 'normal' },
      ],
    });
    // R3: 345 정기점검 — 전부 정상 → A등급
    // (예전에는 입주 전 점검이었으나, 창 13의 345호 입주 전 리포트(id 6)와 목록에서 똑같아 보여 정기점검으로 바꿨다. id는 3 그대로)
    createReport(db, {
      unitId: u345,
      createdBy: contractorId,
      type: 'periodic',
      createdAt: '2026-06-15 10:00:00', // 345호 현재 계약 전(이전 기간) 정기 점검
      opinion: '정기 점검 결과 모든 항목 정상입니다.',
      items: [
        { category: '현관', name: '현관문', state: 'normal' },
        { category: '거실', name: '창호', state: 'normal' },
        { category: '화장실', name: '변기', state: 'normal' },
      ],
    });

    // --- 작성 중(draft) 점검: 345호 입주 전(baseline), 일부 입력된 상태 ---
    createInspection(db, {
      unitId: u345,
      createdBy: contractorId,
      type: 'move_in',
      items: [
        { itemCode: 'LIVING_WINDOW', category: '거실', name: '창호', state: 'minor', description: '작성 중' },
      ],
      zonesConfirmed: ['현관', '주방'],
    });

    // --- 제출 대기(submitted) 점검: 345호 긴급, 문제 항목 + 현장 확인 ---
    const submitted = createInspection(db, {
      unitId: u345,
      createdBy: contractorId,
      type: 'emergency',
      items: [
        { category: '설비·배관', name: '누수', state: 'repair', location: '주방 천장', description: '누수 흔적 발견' },
      ],
      observations: [{ itemIndex: 0, label: '곰팡이 흔적', value: 'present' }],
    });
    db.prepare("UPDATE inspections SET status = 'submitted' WHERE id = ?").run(submitted.id);

    seedDemoMoveInOut(db, { unitId: u1234, contractorId });
    // 시연 리포트 id(4·5)가 바뀌지 않게 1234호 시연 데이터 뒤에 만든다
    seedTenantReportDemo(db, { unitId: u345, contractorId, ownerId, tenantId: tenant345Id, now });
  });

  run();
}

/**
 * reported 점검 1건 + report + snapshot 생성.
 * 등급은 항목(items)에서 computeGrade로 산출하고, 스냅샷은 제출 시(B05)와 동일한
 * buildSnapshot으로 만들어 구조를 일치시킨다.
 */
function createReport(
  db,
  { unitId, createdBy, type, opinion, items = [], zonesConfirmed = [], tenantZones = [], images = [], createdAt = null }
) {
  const flow = flowForType(type);
  const grade = computeGrade(flow, items);

  const inspectionId = db
    .prepare(
      `INSERT INTO inspections (unit_id, created_by, type, flow, status, final_opinion)
       VALUES (?, ?, ?, ?, 'reported', ?)`
    )
    .run(unitId, createdBy, type, flow, opinion).lastInsertRowid;

  const insItem = db.prepare(
    `INSERT INTO inspection_items (inspection_id, item_code, category, name, state, location, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const itemIdByCode = {};
  for (const it of items) {
    const info = insItem.run(
      inspectionId,
      it.itemCode ?? null,
      it.category,
      it.name,
      it.state,
      it.location ?? null,
      it.description ?? null
    );
    if (it.itemCode) itemIdByCode[it.itemCode] = info.lastInsertRowid;
  }

  const insZone = db.prepare(
    "INSERT INTO zone_confirmations (inspection_id, zone, role, confirmed_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))"
  );
  for (const z of zonesConfirmed) insZone.run(inspectionId, z, 'author', createdAt);
  for (const z of tenantZones) insZone.run(inspectionId, z, 'tenant', createdAt);

  // 사진: itemCode면 항목 사진, 아니면 zone 구역 전경 사진
  const insImage = db.prepare(
    `INSERT INTO inspection_images (inspection_id, item_id, zone, data_base64, kind, caption, byte_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const img of images) {
    insImage.run(
      inspectionId,
      img.itemCode ? itemIdByCode[img.itemCode] : null,
      img.itemCode ? null : img.zone,
      img.dataBase64,
      img.kind ?? null,
      img.caption ?? null,
      Buffer.byteLength(img.dataBase64)
    );
  }

  const reportId = db
    .prepare(
      `INSERT INTO reports (inspection_id, unit_id, type, flow, grade, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
    )
    .run(inspectionId, unitId, type, flow, grade, createdBy, createdAt).lastInsertRowid;

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  const inspection = getInspectionById(db, inspectionId);
  const snapshot = buildSnapshot(db, inspection, grade, report);

  insertSnapshot(db, reportId, snapshot);

  return reportId;
}

/** 카탈로그 코드 → 시드 항목 (구역·이름은 카탈로그에서). */
function baselineItem(itemCode, state, description) {
  const { zone, name } = getItem(itemCode);
  return { itemCode, category: zone, name, state, description };
}

/** 시연용 사진: 글자가 들어간 SVG data URL (실제 사진 대신). */
function demoPhoto(label, color) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
    `<rect width="320" height="200" fill="${color}"/>` +
    `<text x="160" y="108" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/** 시연 견적 (progress.md 시연 기준 데이터). */
export const DEMO_ESTIMATES = {
  LIVING_WALLPAPER: 480_000,
  BATHROOM_SILICONE: 150_000,
  KITCHEN_HOOD_FILTER: 60_000,
  BALCONY_SCREEN: 45_000,
};

/**
 * 발표 시연 데이터 (창 9). 1234호 입주 기준선(2024-03-02) ↔ 퇴거 후(2026-03-02) + 정산 초안.
 * - 입주: 화장실 실리콘 경미(항목 사진 없음 → 청구 가능성 '보통'), 7개 구역 작성자 확인,
 *   tenant 확인은 베란다만 빠짐, 거실·주방 구역 전경 사진 → 벽지·후드 필터 '높음', 방충망 '낮음'
 * - 퇴거: 거실 벽지 손상 · 화장실 실리콘 손상 · 주방 후드 필터 경미 · 베란다 방충망 손상 (항목 사진 포함)
 * - 정산 초안: 기본 부담자 + 견적(DEMO_ESTIMATES). 방충망은 보류 → 화면에서 소액 일괄을 누르면 임대인.
 * - 임차인 입주 제보(창 10): 현관 신발장 경미(승인), 방1 문·문틀 경미(대기, 사진). 둘 다 퇴거 때 정상이라
 *   승인해도 diff·정산 시연 값은 그대로다.
 */
function seedDemoMoveInOut(db, { unitId, contractorId }) {
  const moveInId = createReport(db, {
    unitId,
    createdBy: contractorId,
    type: 'move_in',
    createdAt: '2024-03-02 10:00:00',
    opinion: '입주 전 점검 결과 화장실 실리콘 일부 변색(경미) 외 이상 없습니다.',
    items: [baselineItem('BATHROOM_SILICONE', 'minor', '욕조 주변 실리콘 일부 변색')],
    zonesConfirmed: ZONES,
    tenantZones: ZONES.filter((z) => z !== '베란다'),
    images: [
      { zone: '거실', caption: '입주 · 거실 전경', dataBase64: demoPhoto('입주 · 거실 전경', '#4b7bec') },
      { zone: '주방', caption: '입주 · 주방 전경', dataBase64: demoPhoto('입주 · 주방 전경', '#20bf6b') },
    ],
  });

  const moveOutId = createReport(db, {
    unitId,
    createdBy: contractorId,
    type: 'move_out_post',
    createdAt: '2026-03-02 10:00:00',
    opinion: '퇴거 후 점검 결과 거실 벽지·화장실 실리콘·베란다 방충망 손상, 주방 후드 필터 경미 오염을 확인했습니다.',
    items: [
      baselineItem('LIVING_WALLPAPER', 'damaged', 'TV 벽면 찢김 약 40cm'),
      baselineItem('KITCHEN_HOOD_FILTER', 'minor', '기름때 누적'),
      baselineItem('BATHROOM_SILICONE', 'damaged', '욕조 주변 곰팡이·들뜸'),
      baselineItem('BALCONY_SCREEN', 'damaged', '방충망 찢어짐'),
    ],
    zonesConfirmed: ZONES,
    images: [
      { itemCode: 'LIVING_WALLPAPER', caption: '거실 벽지 찢김', dataBase64: demoPhoto('퇴거 · 거실 벽지', '#eb3b5a') },
      { itemCode: 'KITCHEN_HOOD_FILTER', caption: '후드 필터 기름때', dataBase64: demoPhoto('퇴거 · 후드 필터', '#fa8231') },
      { itemCode: 'BATHROOM_SILICONE', caption: '화장실 실리콘 들뜸', dataBase64: demoPhoto('퇴거 · 화장실 실리콘', '#eb3b5a') },
      { itemCode: 'BALCONY_SCREEN', caption: '방충망 찢어짐', dataBase64: demoPhoto('퇴거 · 베란다 방충망', '#eb3b5a') },
    ],
  });

  const shoeCabinet = createTenantReport(
    db,
    moveInId,
    { itemCode: 'ENTRANCE_SHOE_CABINET', state: 'minor', text: '신발장 문 경첩 헐거움', imageBase64: null },
    '2024-03-04 20:00:00'
  );
  decideTenantReport(db, shoeCabinet, 'approved', '2024-03-05 09:00:00');
  createTenantReport(
    db,
    moveInId,
    {
      itemCode: 'ROOM1_DOOR',
      state: 'minor',
      text: '방1 문 하단 긁힘 2곳',
      imageBase64: demoPhoto('임차인 제보 · 방1 문', '#8854d0'),
    },
    '2024-03-08 21:00:00'
  );

  const { changes } = diffBaseline(
    getSnapshotByReportId(db, moveInId),
    getSnapshotByReportId(db, moveOutId),
    ITEM_CATALOG
  );
  createSettlement(db, {
    unitId,
    moveInReportId: moveInId,
    moveOutReportId: moveOutId,
    items: changes.map((ch) => ({
      itemCode: ch.itemCode,
      estimateCost: DEMO_ESTIMATES[ch.itemCode] ?? null,
      payer: defaultPayer(ch),
    })),
  });
}

/**
 * 입주 제보 시연 데이터 (창 13). 345호 · 최임차.
 * - 계약: 시작일 = 기준일(now, DEMO_TODAY) − 2일, 기간 2년, 보증금 30,000,000 · 월세 900,000,
 *   특약 제1항 청소비 150,000(템플릿) + 제2항 자유 문장. 임차인 특약 확인은 아직 안 함.
 * - 입주 전 리포트: 날짜 = 계약 시작일, 작성자 7개 구역 확인, 임차인 구역 확인 없음, 이상 항목 없음,
 *   구역 전경 사진 2장 → 제보 기간(시작 + 7일)이 기준일 기준 5일 남아 화면에서 제보·구역 확인을 할 수 있다.
 */
function seedTenantReportDemo(db, { unitId, contractorId, ownerId, tenantId, now }) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  const end = new Date(start.getFullYear() + 2, start.getMonth(), start.getDate());
  const startDate = toDateString(start);

  createLease(
    db,
    {
      unitId,
      ownerUserId: ownerId,
      tenantUserId: tenantId,
      deposit: 30_000_000,
      monthlyRent: 900_000,
      startDate,
      endDate: toDateString(end),
    },
    [
      { clauseNo: 1, templateCode: 'CLEANING_FEE', params: { amount: 150_000 } },
      { clauseNo: 2, text: '에어컨 배수 호스 막힘은 임차인이 사용 중 관리한다.' },
    ]
  );

  createReport(db, {
    unitId,
    createdBy: contractorId,
    type: 'move_in',
    createdAt: `${startDate} 10:00:00`,
    opinion: '입주 전 점검 결과 모든 구역 이상 없습니다.',
    items: [],
    zonesConfirmed: ZONES,
    images: [
      { zone: '거실', caption: '입주 · 거실 전경', dataBase64: demoPhoto('345호 입주 · 거실 전경', '#4b7bec') },
      { zone: '주방', caption: '입주 · 주방 전경', dataBase64: demoPhoto('345호 입주 · 주방 전경', '#20bf6b') },
    ],
  });
}
