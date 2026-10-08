<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { formatWon } from '../lib/settlementView.js';
import { APPLY_MODE_LABEL, APPLY_MODE_TONE, LEASE_NOTICES, leaseConfirmBadge, formatConfirmedAt } from '../lib/leaseForm.js';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import Pill from '../components/ui/Pill.vue';

// 임대인 계약 이력 (창 12). 최신 계약이 위.
const route = useRoute();
const unitId = computed(() => Number(route.params.id));

const unitName = ref('');
const leases = ref([]);
const error = ref('');
const loading = ref(true);

// 목업 lease-list: 확인 뱃지 ok·warn·plain (특약 모드 색은 APPLY_MODE_TONE)
const BADGE_TONE = { green: 'ok', amber: 'warn', slate: 'plain' };

onMounted(async () => {
  try {
    const [units, data] = await Promise.all([apiFetch('/api/units'), apiFetch(`/api/units/${unitId.value}/leases`)]);
    unitName.value = units.units.find((u) => u.id === unitId.value)?.name ?? '';
    leases.value = data.leases;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <RouterLink to="/owner/reports" class="self-start text-[13px] font-semibold text-accent">← 리포트 목록으로</RouterLink>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xl font-bold tracking-tight">계약 이력 <span v-if="unitName" class="text-ink-3">· {{ unitName }}</span></h2>
      <AppButton :as="RouterLink" :to="`/owner/units/${unitId}/house-log`" variant="ghost" sm data-test="house-log-link">
        House Log
      </AppButton>
    </div>
    <AppButton :as="RouterLink" :to="`/owner/units/${unitId}/leases/new`">+ 새 계약 등록</AppButton>
    <p class="text-xs text-ink-3">{{ LEASE_NOTICES[1] }}</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="!loading && !error && leases.length === 0" class="rounded-btn bg-surface px-3.5 py-3 text-[13px] text-ink-2">등록된 계약이 없습니다.</p>

    <AppCard v-for="l in leases" :key="l.id" as="article" data-test="lease-card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="num text-[13.5px] font-semibold">{{ l.startDate }} ~ {{ l.endDate }}</h3>
        <Pill :tone="BADGE_TONE[leaseConfirmBadge(l).tone]">
          {{ leaseConfirmBadge(l).text }}
          <template v-if="l.tenantConfirmedAt"> · <span class="num">{{ formatConfirmedAt(l.tenantConfirmedAt) }}</span></template>
        </Pill>
      </div>
      <p class="text-[12.5px] text-ink-2">
        임차인 {{ l.tenantName }} · 보증금 <span class="num">{{ formatWon(l.deposit) }}</span> · 월세 <span class="num">{{ formatWon(l.monthlyRent) }}</span>
      </p>
      <div v-if="l.clauses.length" class="h-px bg-line"></div>
      <ol class="flex flex-col gap-3">
        <li v-for="c in l.clauses" :key="c.id" class="flex flex-col gap-1">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <b class="text-[13px]">
              특약 제{{ c.clauseNo }}항<span v-if="c.templateTitle"> · {{ c.templateTitle }}</span>
            </b>
            <Pill :tone="APPLY_MODE_TONE[c.applyMode]">{{ APPLY_MODE_LABEL[c.applyMode] }}</Pill>
          </div>
          <p class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2">"{{ c.text }}"</p>
          <span class="text-xs text-ink-3">
            <template v-if="c.tenantConfirmedAt">임차인 확인 <span class="num">{{ formatConfirmedAt(c.tenantConfirmedAt) }}</span></template>
            <template v-else>임차인 미확인</template>
          </span>
        </li>
      </ol>
    </AppCard>
  </section>
</template>
