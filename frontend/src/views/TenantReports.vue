<script setup>
import { ref, computed, onMounted } from 'vue';
import { apiFetch } from '../lib/api.js';
import { formatWon } from '../lib/settlementView.js';
import { APPLY_MODE_LABEL, APPLY_MODE_TONE, LEASE_NOTICES, pendingLeases } from '../lib/leaseForm.js';
import ReportListCards from '../components/ReportListCards.vue';
import { houseLogPath } from '../lib/houseLogView.js';
import { RouterLink } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import Pill from '../components/ui/Pill.vue';

const reports = ref([]);
const error = ref('');
const loading = ref(true);

// 확인할 계약 (창 12): 본인 호실의 본인 계약 중 특약을 아직 확인하지 않은 것
const leases = ref([]); // [{ ...lease, unitName }]
const units = ref([]); // 본인 호실 — House Log 버튼 (창 18)
const confirming = ref(null);
const leaseError = ref('');
const pending = computed(() => pendingLeases(leases.value));

async function loadLeases() {
  const { units: list } = await apiFetch('/api/units');
  units.value = list;
  const lists = await Promise.all(
    list.map((u) =>
      apiFetch(`/api/units/${u.id}/leases`).then((d) => d.leases.map((l) => ({ ...l, unitName: u.name })))
    )
  );
  leases.value = lists.flat();
}

async function confirmLease(lease) {
  confirming.value = lease.id;
  leaseError.value = '';
  try {
    const { lease: updated } = await apiFetch(`/api/leases/${lease.id}/confirm`, { method: 'POST' });
    leases.value = leases.value.map((l) => (l.id === updated.id ? { ...updated, unitName: l.unitName } : l));
  } catch (e) {
    leaseError.value = e.message;
  } finally {
    confirming.value = null;
  }
}

onMounted(async () => {
  try {
    reports.value = (await apiFetch('/api/reports')).reports;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
  // 계약 카드는 못 불러와도 리포트 목록은 보인다
  loadLeases().catch((e) => (leaseError.value = e.message));
});
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xl font-bold tracking-tight">임차인 리포트</h2>
      <div class="flex flex-wrap gap-1.5">
        <AppButton
          v-for="u in units"
          :key="u.id"
          :as="RouterLink"
          :to="houseLogPath('tenant', u.id)"
          variant="ghost"
          sm
          data-test="house-log-link"
        >
          {{ u.name }} House Log
        </AppButton>
      </div>
    </div>

    <!-- 목업 t-lease: warn 테두리 카드 -->
    <AppCard v-for="l in pending" :key="l.id" as="article" class="border-warn!" data-test="pending-lease">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">확인할 계약</span>
      <h3 class="text-[15px] font-semibold">{{ l.unitName }} · <span class="num">{{ l.startDate }} ~ {{ l.endDate }}</span></h3>
      <p class="text-[12.5px] text-ink-2">
        보증금 <span class="num">{{ formatWon(l.deposit) }}</span> · 월세 <span class="num">{{ formatWon(l.monthlyRent) }}</span>
      </p>
      <ol class="flex flex-col gap-2.5">
        <li v-for="c in l.clauses" :key="c.id" class="flex flex-col gap-[3px]">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <b class="text-[13px]">특약 제{{ c.clauseNo }}항</b>
            <Pill :tone="APPLY_MODE_TONE[c.applyMode]">{{ APPLY_MODE_LABEL[c.applyMode] }}</Pill>
          </div>
          <p class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2">"{{ c.text }}"</p>
        </li>
      </ol>
      <p class="text-xs text-ink-3">{{ LEASE_NOTICES[1] }} 확인 기록은 수정·취소할 수 없습니다.</p>
      <AppButton :disabled="confirming === l.id" @click="confirmLease(l)">
        {{ confirming === l.id ? '확인 중…' : '계약·특약 확인' }}
      </AppButton>
    </AppCard>
    <p v-if="leaseError" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ leaseError }}</p>

    <p class="text-[13px] text-ink-2">본인 거주 호실의 리포트입니다.</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <ReportListCards :reports="reports" base-path="/tenant/reports" />
  </section>
</template>
