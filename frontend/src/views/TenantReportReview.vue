<script setup>
// 임대인 "입주 제보 승인" (progress.md 창 10).
// 임차인이 입주 리포트에 올린 이상 제보를 승인·거절한다. 승인한 것만 비교(diff)에서 입주 상태로 반영된다.
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { session } from '../stores/session.js';
import { stateBadge, tierLabel } from '../lib/diffView.js';
import { statusBadge, deadlineBadge, windowText, countByStatus, sortReports, zoneCells } from '../lib/tenantReportView.js';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import Banner from '../components/ui/Banner.vue';
import DdayChip from '../components/ui/DdayChip.vue';
import NumText from '../components/ui/NumText.vue';
import Pill from '../components/ui/Pill.vue';

const route = useRoute();
const data = ref(null);
const error = ref('');
const loading = ref(true);
const busyId = ref(null);

const reportId = computed(() => route.params.id);
const isOwner = computed(() => session.role === 'owner');
const deadline = computed(() => deadlineBadge(data.value?.window));
const counts = computed(() => countByStatus(data.value?.tenantReports));
const reports = computed(() => sortReports(data.value?.tenantReports));
const cells = computed(() => zoneCells(data.value?.zones));

async function load() {
  try {
    data.value = await apiFetch(`/api/reports/${reportId.value}/tenant-reports`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function decide(tr, action) {
  busyId.value = tr.id;
  error.value = '';
  try {
    const { tenantReport } = await apiFetch(`/api/tenant-reports/${tr.id}/${action}`, { method: 'POST' });
    data.value.tenantReports = data.value.tenantReports.map((r) => (r.id === tenantReport.id ? tenantReport : r));
  } catch (e) {
    error.value = e.message;
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <RouterLink :to="`/owner/reports/${reportId}`" class="self-start text-[13px] font-semibold text-accent">← 리포트로</RouterLink>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-lg font-bold tracking-tight">입주 제보 승인</h2>
      <DdayChip v-if="deadline.label" :severity="deadline.severity" data-test="deadline"><NumText :text="deadline.label" /></DdayChip>
    </div>
    <p v-if="data" class="text-[12.5px] text-ink-3"><NumText :text="windowText(data.window)" /> · 계약 시작일부터 <span class="num">7</span>일</p>
    <p class="text-xs text-ink-3">
      승인한 제보만 입주 기준선에 들어갑니다(퇴거 비교 때 입주 상태로 반영). 거절한 제보는 비교 화면에 "다툼"으로 표시됩니다.
    </p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <Banner v-if="data && !isOwner" tone="plain">승인·거절은 임대인만 할 수 있습니다.</Banner>

    <template v-if="data">
      <!-- 구역 확인 현황 (목업 zgrid) -->
      <AppCard>
        <h3 class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">임차인 구역 확인</h3>
        <p class="text-[12.5px]" data-test="unconfirmed">
          <template v-if="data.unconfirmedZones.length">
            <span class="font-semibold text-warn">미확인 구역 {{ data.unconfirmedZones.length }}</span>
            <span class="text-ink-3"> · {{ data.unconfirmedZones.join(', ') }}</span>
          </template>
          <span v-else class="text-ok">7개 구역 모두 임차인이 확인했습니다.</span>
        </p>
        <div class="grid grid-cols-4 gap-1.5">
          <div v-for="c in cells" :key="c.zone" :class="['rounded-[9px] px-1 py-1.5 text-center text-[11.5px]', c.class]">
            {{ c.zone }}<br />{{ c.label }}
          </div>
        </div>
      </AppCard>

      <!-- 제보 카드 -->
      <p class="text-[12.5px] text-ink-2" data-test="counts">
        <span class="font-semibold text-warn">대기 {{ counts.pending }}</span>
        <span class="text-ink-3"> · </span>
        <span class="text-ok">승인 {{ counts.approved }}</span>
        <span class="text-ink-3"> · </span>
        <span>거절 {{ counts.rejected }}</span>
      </p>
      <p v-if="reports.length === 0" class="rounded-btn bg-surface px-3.5 py-3 text-[13px] text-ink-3">임차인 제보가 없습니다.</p>
      <AppCard v-for="tr in reports" :key="tr.id" as="article" data-test="tenant-report-card">
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-[15px] font-semibold">{{ tr.zone }} · {{ tr.name }}</span>
            <span class="flex flex-wrap gap-1">
              <Pill :tone="tr.tier === 'core' ? 'dark' : 'plain'">{{ tierLabel(tr.tier) }}</Pill>
              <Pill :tone="stateBadge(tr.state).tone">{{ stateBadge(tr.state).label }}</Pill>
            </span>
          </div>
          <Pill :tone="statusBadge(tr.status).tone">{{ statusBadge(tr.status).label }}</Pill>
        </div>
        <p class="text-[12.5px] text-ink-2">{{ tr.text }}</p>
        <img v-if="tr.imageBase64" :src="tr.imageBase64" alt="" class="aspect-[4/3] w-40 rounded-[10px] object-cover" />
        <p class="text-[12.5px] text-ink-3">
          제보 <span class="num">{{ tr.createdAt }}</span><span v-if="tr.decidedAt"> · 처리 <span class="num">{{ tr.decidedAt }}</span></span>
        </p>
        <div v-if="tr.status === 'pending' && isOwner" class="grid grid-cols-2 gap-2.5">
          <AppButton sm class="w-full" :disabled="busyId === tr.id" data-test="approve" @click="decide(tr, 'approve')">승인</AppButton>
          <AppButton variant="ghost" sm class="w-full" :disabled="busyId === tr.id" data-test="reject" @click="decide(tr, 'reject')">
            거절
          </AppButton>
        </div>
      </AppCard>
    </template>
  </section>
</template>
