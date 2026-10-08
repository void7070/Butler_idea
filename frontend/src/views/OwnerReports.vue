<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import ReportListCards from '../components/ReportListCards.vue';
import AppButton from '../components/ui/AppButton.vue';
import Chip from '../components/ui/Chip.vue';

const reports = ref([]);
const ownedUnits = ref([]); // 호실별 "계약" 링크 (창 12)
const error = ref('');
const loading = ref(true);

// 홈 호실 카드의 "리포트"는 ?unit=호실이름 으로 들어온다 (창 14)
const queryUnit = useRoute().query.unit;
const fUnit = ref(typeof queryUnit === 'string' ? queryUnit : '');
const fType = ref('');
const fConfirmed = ref('');

const units = computed(() => [...new Set(reports.value.map((r) => r.unitName))]);
const types = computed(() => [...new Set(reports.value.map((r) => r.typeLabel))]);
// 필터 칩 (목업 .chips) — 첫 칩은 "전체"
const CONFIRMED_OPTIONS = [
  { value: '', label: '확인 상태 전체' },
  { value: 'yes', label: '확인 완료' },
  { value: 'no', label: '미확인' },
];

const filtered = computed(() =>
  reports.value.filter((r) => {
    if (fUnit.value && r.unitName !== fUnit.value) return false;
    if (fType.value && r.typeLabel !== fType.value) return false;
    if (fConfirmed.value === 'yes' && !r.confirmed) return false;
    if (fConfirmed.value === 'no' && r.confirmed) return false;
    return true;
  })
);

onMounted(async () => {
  try {
    const [r, u] = await Promise.all([apiFetch('/api/reports'), apiFetch('/api/units')]);
    reports.value = r.reports;
    ownedUnits.value = u.units;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <h2 class="text-xl font-bold tracking-tight">임대인 리포트</h2>
    <AppButton :as="RouterLink" to="/owner/compare" variant="ghost">리포트 비교</AppButton>

    <div v-if="ownedUnits.length" class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs font-medium text-ink-2">계약·특약</span>
      <AppButton
        v-for="u in ownedUnits"
        :key="u.id"
        :as="RouterLink"
        :to="`/owner/units/${u.id}/leases`"
        variant="ghost"
        sm
        data-test="unit-lease-link"
      >
        {{ u.name }} 계약
      </AppButton>
    </div>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <!-- 필터 (목업 .chips) -->
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="호실">
        <Chip :pressed="fUnit === ''" @click="fUnit = ''">전체 호실</Chip>
        <Chip v-for="u in units" :key="u" :pressed="fUnit === u" @click="fUnit = u">{{ u }}</Chip>
      </div>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="유형">
        <Chip :pressed="fType === ''" @click="fType = ''">전체 유형</Chip>
        <Chip v-for="t in types" :key="t" :pressed="fType === t" @click="fType = t">{{ t }}</Chip>
      </div>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="확인 상태">
        <Chip v-for="o in CONFIRMED_OPTIONS" :key="o.value" :pressed="fConfirmed === o.value" @click="fConfirmed = o.value">
          {{ o.label }}
        </Chip>
      </div>
    </div>

    <ReportListCards :reports="filtered" base-path="/owner/reports" />
  </section>
</template>
