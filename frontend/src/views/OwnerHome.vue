<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import AppCard from '../components/ui/AppCard.vue';
import AppButton from '../components/ui/AppButton.vue';
import DdayChip from '../components/ui/DdayChip.vue';
import NumText from '../components/ui/NumText.vue';
import Pill from '../components/ui/Pill.vue';
import {
  formatToday,
  todoCountText,
  ddayChip,
  todoLink,
  leaseStatusBadge,
  nextDueText,
  unitLinks,
} from '../lib/ownerHome.js';

// 임대인 홈 "오늘 할 일" (창 14). 계산은 백엔드 GET /api/owner/todos, 여기서는 표시만.
const todos = ref([]);
const units = ref([]);
const reports = ref([]); // 퇴거 카드 → 비교 화면 입주·퇴거 리포트 미리 선택용
const error = ref('');
const loading = ref(true);

const today = ref('');
const countText = computed(() => todoCountText(todos.value));

onMounted(async () => {
  try {
    const [t, r, health] = await Promise.all([
      apiFetch('/api/owner/todos'),
      apiFetch('/api/reports').catch(() => ({ reports: [] })),
      apiFetch('/api/health').catch(() => null), // 서버 기준 오늘(시연 기준일, 창 17)
    ]);
    today.value = formatToday(health?.today);
    todos.value = t.todos;
    units.value = t.units;
    reports.value = r.reports;
  } catch (e) {
    error.value = e.message;
  } finally {
    if (!today.value) today.value = formatToday();
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-3.5 pt-0.5">
    <div class="flex items-center justify-between gap-2.5">
      <div class="flex flex-col gap-0.5">
        <span class="text-[12.5px] text-ink-3" data-test="today">{{ today }}</span>
        <h2 class="text-xl font-bold tracking-tight" data-test="todo-count">{{ loading ? '오늘 할 일' : countText }}</h2>
      </div>
      <AppButton :as="RouterLink" to="/owner/repair-ledger" variant="ghost" sm data-test="repair-ledger-link">
        수선비 장부
      </AppButton>
    </div>

    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <template v-else-if="!error">
      <AppCard v-if="!todos.length" class="text-[12.5px] text-ink-3" data-test="no-todos">
        오늘 확인할 일이 없습니다
      </AppCard>
      <AppCard
        v-for="(t, i) in todos"
        :key="`${t.kind}-${t.unitId}-${i}`"
        :as="RouterLink"
        :to="todoLink(t, reports)"
        tap
        :edge="ddayChip(t).severity"
        data-test="todo-card"
      >
        <div class="flex items-start justify-between gap-2.5">
          <span class="min-w-0 text-[15px] font-semibold">
            <span class="text-[12.5px] font-normal text-ink-3">{{ t.unitName }}</span> {{ t.title }}
          </span>
          <DdayChip :severity="ddayChip(t).severity" data-test="dday-chip"><NumText :text="ddayChip(t).label" /></DdayChip>
        </div>
        <span class="text-[12.5px] text-ink-2">{{ t.detail }}</span>
      </AppCard>

      <span class="text-[11.5px] font-semibold tracking-wider text-ink-3">호실 현황</span>
      <p v-if="!units.length" class="text-[12.5px] text-ink-3">등록된 호실이 없습니다.</p>
      <div class="grid grid-cols-2 gap-2.5">
        <AppCard v-for="u in units" :key="u.unitId" class="gap-1.5 p-3" data-test="unit-card">
          <div class="flex items-center justify-between gap-1.5">
            <b>{{ u.unitName }}</b>
            <Pill :tone="leaseStatusBadge(u.leaseStatus).tone">{{ leaseStatusBadge(u.leaseStatus).label }}</Pill>
          </div>
          <span class="text-[12.5px] text-ink-2">임차인 {{ u.tenantName ?? '없음' }}</span>
          <span class="text-[12.5px] text-ink-3">다음 기한 · {{ nextDueText(u.nextDue) }}</span>
          <div class="flex flex-wrap gap-1.5">
            <AppButton :as="RouterLink" :to="unitLinks(u).leases" variant="ghost" sm>계약 이력</AppButton>
            <AppButton :as="RouterLink" :to="unitLinks(u).reports" variant="ghost" sm>리포트</AppButton>
            <AppButton :as="RouterLink" :to="unitLinks(u).houseLog" variant="ghost" sm data-test="house-log-link">
              House Log
            </AppButton>
          </div>
        </AppCard>
      </div>
    </template>
  </section>
</template>
