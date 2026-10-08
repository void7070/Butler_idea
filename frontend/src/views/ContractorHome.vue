<script setup>
import { ref, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import Pill from '../components/ui/Pill.vue';

const inspections = ref([]);
const error = ref('');
const loading = ref(true);

const STATUS_LABEL = { draft: '작성 중', submitted: '제출 대기', reported: '리포트 완료' };
const STATUS_TONE = { draft: 'warn', submitted: 'seal', reported: 'ok' };

const drafts = computed(() => inspections.value.filter((i) => i.status === 'draft'));
const submitted = computed(() => inspections.value.filter((i) => i.status === 'submitted'));
const groups = computed(() => [
  { title: '작성 중', list: drafts.value, empty: '작성 중인 점검이 없습니다.' },
  { title: '제출 대기', list: submitted.value, empty: '제출 대기 중인 점검이 없습니다.' },
]);

onMounted(async () => {
  try {
    const data = await apiFetch('/api/inspections');
    inspections.value = data.inspections;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xl font-bold tracking-tight">시공업자 홈</h2>
      <AppButton :as="RouterLink" to="/contractor/inspections/new" sm>새 점검 시작</AppButton>
    </div>

    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <div v-for="group in groups" :key="group.title" class="flex flex-col gap-2">
      <h3 class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">{{ group.title }} ({{ group.list.length }})</h3>
      <p v-if="!group.list.length" class="text-[12.5px] text-ink-3">{{ group.empty }}</p>
      <ul class="flex flex-col gap-2">
        <AppCard
          v-for="i in group.list"
          :key="i.id"
          :as="RouterLink"
          :to="`/contractor/inspections/${i.id}`"
          tap
          class="gap-1"
        >
          <span class="text-[15px] font-semibold">{{ i.building_name }} {{ i.unit_name }}</span>
          <span class="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
            {{ i.typeLabel }} · <Pill :tone="STATUS_TONE[i.status]">{{ STATUS_LABEL[i.status] }}</Pill>
          </span>
        </AppCard>
      </ul>
    </div>
  </section>
</template>
