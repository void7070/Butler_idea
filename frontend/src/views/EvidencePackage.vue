<script setup>
// 분쟁 대비 증빙 자료 (임대인, 창 19). 인쇄용 — PrintableReport처럼 window.print() + @media print(Tailwind print:).
// GET /api/settlements/:id/evidence 를 그대로 보여 준다. 서버 PDF 생성·외부 전송 없음, 법적 판단 문구 없음.
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import {
  EVIDENCE_TITLE,
  EVIDENCE_NOTICES,
  coverView,
  integrityRows,
  zoneRow,
  tenantReportRow,
  itemCardView,
  responseRows,
  linkLines,
  totalsRows,
  formatStamp,
} from '../lib/evidenceView.js';
import { formatWon } from '../lib/settlementView.js';
import NumText from '../components/ui/NumText.vue';

const route = useRoute();
const pkg = ref(null);
const error = ref('');
const loading = ref(true);

const cover = computed(() => coverView(pkg.value));
const integrity = computed(() => integrityRows(pkg.value));
const zones = computed(() => (pkg.value?.baseline.zoneConfirmations ?? []).map(zoneRow));
const approved = computed(() => (pkg.value?.baseline.approvedTenantReports ?? []).map(tenantReportRow));
const rejected = computed(() => (pkg.value?.baseline.rejectedTenantReports ?? []).map(tenantReportRow));
const items = computed(() => (pkg.value?.items ?? []).map(itemCardView));
const responses = computed(() => responseRows(pkg.value?.items));
const links = computed(() => linkLines(pkg.value?.link));
const totals = computed(() => totalsRows(pkg.value?.totals));

onMounted(async () => {
  try {
    pkg.value = (await apiFetch(`/api/settlements/${route.params.id}/evidence`)).evidence;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function printPackage() {
  window.print();
}
</script>

<template>
  <section class="evidence space-y-6">
    <p v-if="loading" class="text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-md bg-crit-soft p-3 text-sm text-crit" data-test="evidence-error">{{ error }}</p>

    <template v-if="pkg">
      <div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <RouterLink
          :to="{ name: 'owner-settlement', query: { moveInReportId: pkg.baseline.reportId, moveOutReportId: pkg.moveOut.reportId } }"
          class="text-[13px] font-semibold text-accent"
          >← 정산 화면</RouterLink
        >
        <button
          class="rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:brightness-105"
          data-test="print-evidence"
          @click="printPackage"
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <!-- 표지 -->
      <header class="avoid-break rounded-lg border-2 border-ink bg-surface p-6" data-test="evidence-cover">
        <p class="text-xs tracking-widest text-ink-3">BUTLER · 기록 모음</p>
        <h2 class="mt-1 text-2xl font-bold">{{ EVIDENCE_TITLE }}</h2>
        <dl class="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
          <dt class="text-ink-3">호실</dt>
          <dd class="font-semibold">{{ cover.unitName }} <span v-if="cover.address" class="font-normal text-ink-3">· {{ cover.address }}</span></dd>
          <dt class="text-ink-3">계약 기간</dt>
          <dd>{{ cover.leaseRange }}</dd>
          <dt class="text-ink-3">점검 기간</dt>
          <dd>{{ cover.period }}</dd>
          <dt class="text-ink-3">정산</dt>
          <dd>{{ cover.statusText }} · {{ cover.basisText }}</dd>
          <dt class="text-ink-3">생성 시각</dt>
          <dd>{{ cover.generatedText }}</dd>
          <dt class="text-ink-3">해시 요약</dt>
          <dd>
            <span :class="cover.summary.ok ? 'text-ok' : 'font-semibold text-crit'" data-test="cover-integrity">
              {{ cover.summary.ok ? '🔒' : '⚠' }} {{ cover.summary.text }}
            </span>
            <span v-for="h in cover.hashParts" :key="h.key" class="block text-xs text-ink-3">{{ h.label }} <span class="num">{{ h.hash }}</span></span>
          </dd>
        </dl>
        <ol class="mt-4 list-inside list-decimal text-xs text-ink-2">
          <li>계약과 특약</li>
          <li>입주 기준선</li>
          <li>항목별 비교와 청구 근거</li>
          <li>임차인 응답 이력</li>
          <li>무결성 검증 결과</li>
        </ol>
      </header>

      <!-- 1. 계약과 특약 -->
      <section class="space-y-2" data-test="evidence-lease">
        <h3 class="text-lg font-semibold">1. 계약과 특약</h3>
        <p v-if="!pkg.lease" class="text-sm text-ink-3">연결된 계약이 없습니다.</p>
        <template v-else>
          <p class="text-sm">
            임차인 {{ pkg.lease.tenantName ?? '-' }} · 기간 {{ pkg.lease.range }} · 보증금 {{ formatWon(pkg.lease.deposit) }}
            <span v-if="pkg.lease.monthlyRent"> · 월세 {{ formatWon(pkg.lease.monthlyRent) }}</span>
          </p>
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-line text-left text-xs text-ink-3">
                <th class="py-1 pr-2">항</th>
                <th class="py-1 pr-2">특약 원문</th>
                <th class="py-1 pr-2">적용</th>
                <th class="py-1">임차인 확인</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in pkg.lease.clauses" :key="c.clauseNo" class="avoid-break border-b border-line align-top">
                <td class="py-1 pr-2 whitespace-nowrap">제{{ c.clauseNo }}항</td>
                <td class="py-1 pr-2">{{ c.text }}</td>
                <td class="py-1 pr-2 whitespace-nowrap">{{ c.applyLabel }}</td>
                <td class="py-1 whitespace-nowrap">{{ c.tenantConfirmedAt ? formatStamp(c.tenantConfirmedAt) : '미확인' }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>

      <!-- 2. 입주 기준선 -->
      <section class="space-y-3" data-test="evidence-baseline">
        <h3 class="text-lg font-semibold">2. 입주 기준선</h3>
        <p class="text-sm">
          입주 전 리포트 #{{ pkg.baseline.reportId }} · {{ pkg.baseline.date }}
          <span v-if="pkg.baseline.contractor"> · 점검 {{ pkg.baseline.contractor }}</span>
          <span v-if="pkg.baseline.grade"> · 등급 {{ pkg.baseline.grade }}</span>
          <span class="text-ink-3"> / </span>
          {{ pkg.moveOut.typeLabel ?? '퇴거' }} 리포트 #{{ pkg.moveOut.reportId }} · {{ pkg.moveOut.date }}
        </p>
        <table class="w-full border-collapse text-sm avoid-break">
          <thead>
            <tr class="border-b border-line text-left text-xs text-ink-3">
              <th class="py-1 pr-2">구역</th>
              <th class="py-1 pr-2">작성자 확인</th>
              <th class="py-1">임차인 확인</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="z in zones" :key="z.zone" class="border-b border-line">
              <td class="py-1 pr-2">{{ z.zone }}</td>
              <td class="py-1 pr-2">{{ z.author }}</td>
              <td class="py-1" :class="z.tenant === '미확인' ? 'text-ink-3' : ''">
                {{ z.tenant }} <span v-if="z.tenantAt" class="text-xs text-ink-3">{{ z.tenantAt }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="avoid-break rounded-md border border-line p-3 text-sm">
            <p class="font-semibold">승인된 입주 제보 ({{ approved.length }})</p>
            <p v-if="approved.length === 0" class="text-ink-3">없음</p>
            <div v-for="r in approved" :key="r.key" class="mt-2">
              <p>{{ r.title }}</p>
              <p class="text-ink-2">{{ r.text }}</p>
              <p class="text-xs text-ink-3">제보 {{ r.createdAt }} · 승인 {{ r.decidedAt }}</p>
              <img v-if="r.image" :src="r.image" alt="제보 사진" class="mt-1 max-h-32 rounded border" />
            </div>
          </div>
          <div class="avoid-break rounded-md border border-line p-3 text-sm">
            <p class="font-semibold">거절된 입주 제보 ({{ rejected.length }})</p>
            <p v-if="rejected.length === 0" class="text-ink-3">없음</p>
            <div v-for="r in rejected" :key="r.key" class="mt-2">
              <p>{{ r.title }}</p>
              <p class="text-ink-2">{{ r.text }}</p>
              <p class="text-xs text-ink-3">제보 {{ r.createdAt }} · 거절 {{ r.decidedAt }}</p>
              <img v-if="r.image" :src="r.image" alt="제보 사진" class="mt-1 max-h-32 rounded border" />
            </div>
          </div>
        </div>
        <p v-if="pkg.baseline.pendingTenantReportCount" class="text-xs text-ink-3">
          결정 대기 중인 제보 {{ pkg.baseline.pendingTenantReportCount }}건은 기준선에 반영하지 않았습니다.
        </p>
      </section>

      <!-- 3. 항목별 비교와 청구 근거 -->
      <section class="space-y-3" data-test="evidence-items">
        <h3 class="text-lg font-semibold">3. 항목별 비교와 청구 근거</h3>
        <p v-if="items.length === 0" class="text-sm text-ink-3">입주 때보다 나빠진 항목이 없습니다.</p>
        <article
          v-for="it in items"
          :key="it.key"
          class="avoid-break space-y-2 rounded-lg border border-line bg-surface p-4 text-sm"
          data-test="evidence-item"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-semibold">{{ it.title }}</p>
            <p class="font-semibold">{{ it.payerLabel }} · {{ it.amountText }}</p>
          </div>
          <p class="text-ink-2">{{ it.stateText }} · {{ it.evidenceLabel }}</p>
          <div class="grid grid-cols-2 gap-3">
            <figure>
              <figcaption class="text-xs text-ink-3">{{ it.moveInOverview ? '입주 사진 (구역 전경)' : '입주 사진' }}</figcaption>
              <img v-for="img in it.moveInImages" :key="img.id" :src="img.data_base64" :alt="img.caption ?? '입주 사진'" class="mt-1 max-h-40 rounded border" />
              <p v-if="it.moveInImages.length === 0" class="mt-1 text-xs text-ink-3">{{ it.evidence === 'mid' ? '입주 사진 없음 · 양측 확인 기록 있음' : '입주 사진 없음' }}</p>
            </figure>
            <figure>
              <figcaption class="text-xs text-ink-3">퇴거 사진</figcaption>
              <img v-for="img in it.moveOutImages" :key="img.id" :src="img.data_base64" :alt="img.caption ?? '퇴거 사진'" class="mt-1 max-h-40 rounded border" />
              <p v-if="it.moveOutImages.length === 0" class="mt-1 text-xs text-ink-3">퇴거 사진 없음</p>
            </figure>
          </div>
          <div class="rounded-md bg-surface-2 p-3">
            <p class="text-xs text-ink-3">적용 기준 · {{ it.basisTitle }}</p>
            <p v-if="it.clauseText" class="mt-1 whitespace-pre-line">“{{ it.clauseText }}”</p>
            <p class="mt-1 text-ink-2">{{ it.formula }}</p>
          </div>
        </article>

        <article v-for="f in pkg.fees" :key="`fee-${f.clauseNo}`" class="avoid-break rounded-lg border border-line p-4 text-sm">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-semibold">{{ f.title ?? '고정 금액 특약' }}</p>
            <p class="font-semibold">임차인 부담 · {{ formatWon(f.amount) }}</p>
          </div>
          <p class="text-xs text-ink-3">적용 기준 · 계약 특약 제{{ f.clauseNo }}항</p>
          <p class="mt-1">“{{ f.text }}”</p>
        </article>

        <div v-for="m in pkg.manualClauses" :key="`manual-${m.clauseNo}`" class="avoid-break rounded-lg border border-warn bg-warn-soft p-3 text-sm text-warn">
          <p class="font-semibold">수동 확인 필요 · 특약 제{{ m.clauseNo }}항</p>
          <p>{{ m.text }}</p>
          <p class="text-xs">자동 계산에 반영하지 않았습니다.</p>
        </div>

        <dl class="avoid-break space-y-1 rounded-lg border border-line p-4 text-sm" data-test="evidence-totals">
          <div v-for="r in totals" :key="r.key" class="flex justify-between gap-2">
            <dt class="text-ink-2">{{ r.label }}</dt>
            <dd class="font-semibold"><NumText :text="r.value" /></dd>
          </div>
        </dl>
      </section>

      <!-- 4. 임차인 응답 이력 -->
      <section class="space-y-2" data-test="evidence-responses">
        <h3 class="text-lg font-semibold">4. 임차인 응답 이력</h3>
        <ul class="text-sm text-ink-2">
          <li v-for="l in links" :key="l">{{ l }}</li>
        </ul>
        <p v-if="responses.length === 0" class="text-sm text-ink-3">임차인 응답이 없습니다.</p>
        <div
          v-for="r in responses"
          :key="r.key"
          :class="['avoid-break rounded-md border p-3 text-sm', r.response === 'object' ? 'border-crit' : 'border-line']"
          data-test="evidence-response"
        >
          <p>
            <span class="font-semibold">{{ r.title }}</span> ·
            <span :class="r.response === 'object' ? 'font-semibold text-crit' : 'text-ok'">{{ r.label }}</span>
            <span class="text-xs text-ink-3"> · {{ r.at }}</span>
          </p>
          <p v-if="r.text" class="mt-1 whitespace-pre-line">“{{ r.text }}”</p>
          <img v-if="r.image" :src="r.image" alt="임차인 첨부 사진" class="mt-2 max-h-40 rounded border" />
        </div>
      </section>

      <!-- 5. 무결성 검증 결과 -->
      <section class="avoid-break space-y-2" data-test="evidence-integrity">
        <h3 class="text-lg font-semibold">5. 무결성 검증 결과</h3>
        <p class="text-xs text-ink-3">검증 시각 {{ formatStamp(pkg.integrity.verifiedAt) }} · SHA-256 (저장된 해시 ↔ 지금 다시 계산한 해시)</p>
        <div
          v-for="r in integrity"
          :key="r.key"
          :class="[
            'rounded-md border p-3 text-sm',
            r.status === 'fail' ? 'border-crit bg-crit-soft' : r.status === 'ok' ? 'border-ok' : 'border-line',
          ]"
          :data-status="r.status"
        >
          <p>
            <span class="font-semibold">{{ r.label }}</span> ·
            <span :class="{ 'text-ok': r.status === 'ok', 'font-semibold text-crit': r.status === 'fail', 'text-ink-3': r.status === 'none' }">{{ r.text }}</span>
          </p>
          <template v-if="r.status !== 'none'">
            <p class="break-all text-xs text-ink-3">저장 <span class="num">{{ r.storedHash }}</span></p>
            <p class="break-all text-xs text-ink-3">현재 <span class="num">{{ r.currentHash }}</span></p>
          </template>
        </div>
      </section>

      <!-- 고지 -->
      <footer class="avoid-break space-y-1 rounded-md bg-surface-2 p-3 text-xs text-ink-2" data-test="evidence-notice">
        <p v-for="n in EVIDENCE_NOTICES" :key="n">※ {{ n }}</p>
      </footer>
    </template>
  </section>
</template>

<style scoped>
@media print {
  .avoid-break {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .evidence h3 {
    break-after: avoid;
    page-break-after: avoid;
  }
  .evidence header {
    break-after: page;
    page-break-after: always;
  }
}
</style>
