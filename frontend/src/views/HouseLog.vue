<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { session } from '../stores/session.js';
import {
  FILTERS,
  kindMeta,
  leaseSections,
  integritySummary,
  integrityChip,
  eventDate,
  countText,
} from '../lib/houseLogView.js';
import AppCard from '../components/ui/AppCard.vue';
import Chip from '../components/ui/Chip.vue';
import Pill from '../components/ui/Pill.vue';

// House Log (창 18): 호실의 모든 기록을 시간순으로. 계산은 백엔드 GET /api/units/:id/house-log, 여기서는 표시만.
const route = useRoute();
const unitId = computed(() => Number(route.params.id));
const isTenant = computed(() => session.role === 'tenant');

const log = ref(null);
const filter = ref('all');
const error = ref('');
const loading = ref(true);

const sections = computed(() => leaseSections(log.value, filter.value));
const summary = computed(() => integritySummary(log.value?.events ?? []));
const backLink = computed(() => (isTenant.value ? '/tenant/reports' : '/owner'));

onMounted(async () => {
  try {
    log.value = await apiFetch(`/api/units/${unitId.value}/house-log`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <RouterLink :to="backLink" class="self-start text-[13px] font-semibold text-accent">
      ← {{ isTenant ? '리포트 목록으로' : '홈으로' }}
    </RouterLink>

    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <template v-if="log">
      <div class="flex flex-col gap-1.5">
        <h2 class="text-xl font-bold tracking-tight">
          House Log <span class="text-ink-3">· {{ log.unit.name }}</span>
        </h2>
        <p class="text-[12.5px] text-ink-2" data-test="event-count">
          {{ countText(log.events) }}
          <span v-if="isTenant"> · 본인 계약 기간의 기록만 보입니다</span>
        </p>
        <!-- 목업 sealbox 축소판 -->
        <p
          class="self-start rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-bold"
          :class="summary.class"
          :data-ok="summary.allOk"
          data-test="integrity-summary"
        >
          {{ summary.text }}
        </p>
      </div>

      <div class="flex flex-wrap gap-1.5" role="tablist">
        <Chip
          v-for="f in FILTERS"
          :key="f.key"
          :pressed="filter === f.key"
          :data-test="`filter-${f.key}`"
          @click="filter = f.key"
        >
          {{ f.label }}
        </Chip>
      </div>

      <p v-if="!sections.length" class="rounded-btn bg-surface px-3.5 py-3 text-[13px] text-ink-3">표시할 기록이 없습니다.</p>

      <AppCard v-for="s in sections" :key="s.key" as="article" data-test="lease-section">
        <h3 class="text-[13.5px] font-semibold">{{ s.title }}</h3>
        <p v-if="!s.events.length" class="text-[12.5px] text-ink-3">이 기간의 기록이 없습니다.</p>
        <!-- 목업 .timeline: 날짜 mono · 점 · 내용 -->
        <ol class="flex flex-col">
          <li
            v-for="(e, i) in s.events"
            :key="`${e.kind}-${e.at}-${i}`"
            class="grid grid-cols-[76px_10px_minmax(0,1fr)] items-start gap-2 pb-2.5 text-[12.5px]"
            data-test="event"
          >
            <span class="num pt-px text-[11.5px] leading-tight text-ink-3">
              {{ eventDate(e.at).date }}<br />{{ eventDate(e.at).time }}
            </span>
            <span class="mt-[5px] h-[9px] w-[9px] rounded-full" :class="kindMeta(e.kind).dot" aria-hidden="true"></span>
            <component
              :is="e.link ? RouterLink : 'div'"
              :to="e.link || undefined"
              class="-mx-1.5 -mt-0.5 flex min-w-0 flex-col gap-0.5 rounded-lg px-1.5 py-0.5"
              :class="e.link ? 'hover:bg-surface-2' : ''"
            >
              <span class="flex flex-wrap items-center gap-1">
                <Pill>{{ kindMeta(e.kind).icon }} {{ kindMeta(e.kind).label }}</Pill>
                <span
                  v-if="integrityChip(e.integrity)"
                  class="rounded-chip px-2 py-0.5 text-[11.5px] font-semibold"
                  :class="[integrityChip(e.integrity).class, e.integrity.ok ? 'num' : '']"
                  data-test="integrity-chip"
                >
                  {{ integrityChip(e.integrity).text }}
                </span>
              </span>
              <span class="font-semibold text-ink">{{ e.title }}</span>
              <span class="text-ink-2">
                {{ e.detail }}<span v-if="e.actor" class="text-ink-3"> · {{ e.actor }}</span>
              </span>
            </component>
          </li>
        </ol>
      </AppCard>
    </template>
  </section>
</template>
