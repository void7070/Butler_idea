<script setup>
// 목업 report-list: 호실 · 등급, 유형 · 리포트 번호 · 날짜, 확인 상태 (창 23)
import { RouterLink } from 'vue-router';
import AppCard from './ui/AppCard.vue';
import GradeChip from './ui/GradeChip.vue';
import Pill from './ui/Pill.vue';

defineProps({
  reports: { type: Array, default: () => [] },
  basePath: { type: String, required: true }, // 예: '/owner/reports'
});
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <p v-if="!reports.length" class="text-[12.5px] text-ink-3">표시할 리포트가 없습니다.</p>
    <AppCard v-for="r in reports" :key="r.id" :as="RouterLink" :to="`${basePath}/${r.id}`" tap class="gap-1">
      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 truncate text-[15px] font-semibold">{{ r.building }} {{ r.unitName }}</span>
        <GradeChip :grade="r.grade" />
      </div>
      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-3">
        <span>{{ r.typeLabel }} · 리포트 #{{ r.id }}</span>
        <span v-if="r.createdAt" class="num">· {{ r.createdAt.slice(0, 10) }}</span>
        <Pill :tone="r.confirmed ? 'ok' : 'plain'" class="ml-auto">{{ r.confirmed ? '확인 완료' : '미확인' }}</Pill>
      </div>
    </AppCard>
  </div>
</template>
