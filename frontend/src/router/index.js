import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from '../stores/session.js';
import RoleUserSelector from '../views/RoleUserSelector.vue';
import ContractorHome from '../views/ContractorHome.vue';
import NewInspection from '../views/NewInspection.vue';
import InspectionEdit from '../views/InspectionEdit.vue';
import OwnerHome from '../views/OwnerHome.vue';
import OwnerReports from '../views/OwnerReports.vue';
import TenantReports from '../views/TenantReports.vue';
import ReportDetail from '../views/ReportDetail.vue';
import ReportCompareView from '../views/ReportCompareView.vue';
import SettlementView from '../views/SettlementView.vue';
import TenantReportReview from '../views/TenantReportReview.vue';
import SharedReport from '../views/SharedReport.vue';
import SharedSettlement from '../views/SharedSettlement.vue';
import PrintableReport from '../views/PrintableReport.vue';
import LeaseList from '../views/LeaseList.vue';
import LeaseForm from '../views/LeaseForm.vue';
import RepairLedger from '../views/RepairLedger.vue';
import HouseLog from '../views/HouseLog.vue';
import EvidencePackage from '../views/EvidencePackage.vue';

// 전체 라우트 표는 PRD §21 참고. F03~F08에서 점검 작성/리포트 상세/비교/공유 화면을 채운다.
// meta.wide = 앱 틀의 가운데 430px 단을 벗어나 넓게 보이는 인쇄용 화면 (창 21, App.vue)
const routes = [
  { path: '/', name: 'home', component: RoleUserSelector },
  { path: '/contractor', name: 'contractor-home', component: ContractorHome, meta: { requiresUser: true } },
  { path: '/contractor/inspections/new', name: 'inspection-new', component: NewInspection, meta: { requiresUser: true } },
  { path: '/contractor/inspections/:id', name: 'inspection-edit', component: InspectionEdit, meta: { requiresUser: true } },
  // 임대인 홈 "오늘 할 일" (창 14)
  { path: '/owner', name: 'owner-home', component: OwnerHome, meta: { requiresUser: true } },
  { path: '/owner/reports', name: 'owner-reports', component: OwnerReports, meta: { requiresUser: true } },
  { path: '/owner/reports/:id', name: 'owner-report-detail', component: ReportDetail, meta: { requiresUser: true } },
  // 입주 제보 승인 (창 10). :id = 입주 전 리포트
  { path: '/owner/reports/:id/tenant-reports', name: 'owner-tenant-reports', component: TenantReportReview, meta: { requiresUser: true } },
  { path: '/owner/compare', name: 'owner-compare', component: ReportCompareView, meta: { requiresUser: true } },
  // 보증금 공제 근거 (창 8). query: moveInReportId, moveOutReportId — 이름은 lib/diffView.js SETTLEMENT_ROUTE와 같아야 한다
  { path: '/owner/settlement', name: 'owner-settlement', component: SettlementView, meta: { requiresUser: true } },
  // 분쟁 대비 증빙 자료 (창 19, 인쇄용). :id = 정산 — 경로는 lib/evidenceView.js evidencePath와 같아야 한다
  { path: '/owner/settlements/:id/evidence', name: 'owner-settlement-evidence', component: EvidencePackage, meta: { requiresUser: true, wide: true } },
  // 계약·특약 (창 12). :id = 호실
  { path: '/owner/units/:id/leases', name: 'owner-leases', component: LeaseList, meta: { requiresUser: true } },
  { path: '/owner/units/:id/leases/new', name: 'owner-lease-new', component: LeaseForm, meta: { requiresUser: true } },
  // 수선비 장부 + CSV (창 16)
  { path: '/owner/repair-ledger', name: 'owner-repair-ledger', component: RepairLedger, meta: { requiresUser: true } },
  // House Log (창 18). :id = 호실. 임차인은 본인 계약 기간만
  { path: '/owner/units/:id/house-log', name: 'owner-house-log', component: HouseLog, meta: { requiresUser: true } },
  { path: '/tenant/units/:id/house-log', name: 'tenant-house-log', component: HouseLog, meta: { requiresUser: true } },
  { path: '/tenant/reports', name: 'tenant-reports', component: TenantReports, meta: { requiresUser: true } },
  { path: '/tenant/reports/:id', name: 'tenant-report-detail', component: ReportDetail, meta: { requiresUser: true } },
  // 인쇄용 (역할 무관, 본인 접근 가능 리포트)
  { path: '/reports/:id/print', name: 'report-print', component: PrintableReport, meta: { requiresUser: true, wide: true } },
  // 임차인 정산 링크 (비인증, 창 11) — 동의/이의 응답
  { path: '/share/settlement/:token', name: 'shared-settlement', component: SharedSettlement },
  // 공유 링크 (비인증, 7일 뒤 만료)
  { path: '/share/:token', name: 'shared-report', component: SharedReport },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 사용자 미선택 시 선택 화면으로
router.beforeEach((to) => {
  if (to.meta.requiresUser && !isLoggedIn()) return { name: 'home' };
  return true;
});

export default router;
