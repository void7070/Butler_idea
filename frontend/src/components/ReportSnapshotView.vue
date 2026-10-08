<script setup>
// 리포트 스냅샷 표현 전용 컴포넌트 (리포트 상세·공유·비교). 인쇄(PrintableReport)는 자체 레이아웃을 쓴다.
// 창 23: 목업 report — 상단 요약(호실·유형·날짜, 등급·작성자), 공간별 카드, 사진 2열, 최종 의견 카드.
import { computed } from 'vue';
import { gradeClass, stateLabel, stateTone, observationValueLabel } from '../lib/reportView.js';
import AppCard from './ui/AppCard.vue';
import Pill from './ui/Pill.vue';

const props = defineProps({
  snapshot: { type: Object, required: true },
});

// 점검 항목을 공간(category)별로 묶는다. 순서는 스냅샷 순서 그대로.
const spaces = computed(() => {
  const groups = new Map();
  for (const it of props.snapshot.items ?? []) {
    const key = it.category ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups].map(([space, items]) => ({ space, items }));
});
</script>

<template>
  <article class="flex flex-col gap-3.5">
    <!-- 상단 요약 -->
    <header class="flex flex-col gap-2">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-lg font-bold tracking-tight">{{ snapshot.unit.building }} {{ snapshot.unit.name }}</h2>
        <p class="text-[12.5px] text-ink-3">{{ snapshot.inspection.typeLabel }} · <span class="num">{{ snapshot.generatedAt }}</span></p>
      </div>
      <div class="flex items-center gap-2">
        <span :class="['shrink-0 rounded-[7px] px-2 py-[3px] text-[13px] font-bold', gradeClass(snapshot.grade)]">
          <span class="num">{{ snapshot.grade }}</span>등급
        </span>
        <span class="text-[12.5px] text-ink-2">
          <span>시공업자 {{ snapshot.parties.contractor?.name }}</span> ·
          <span>임대인 {{ snapshot.parties.owner?.name ?? '-' }}</span> ·
          <span>임차인 {{ snapshot.parties.tenant?.name ?? '-' }}</span>
        </span>
      </div>
    </header>

    <!-- 점검 항목 (공간별 카드) -->
    <AppCard v-for="g in spaces" :key="g.space" class="gap-2">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">{{ g.space || '점검 항목' }}</span>
      <div v-for="(it, i) in g.items" :key="i" class="flex items-start justify-between gap-2 text-[12.5px] text-ink-2">
        <span class="min-w-0">
          <b class="font-semibold text-ink">{{ it.name }}</b>
          <span v-if="it.location"> · {{ it.location }}</span>
          <span v-if="it.description"> — {{ it.description }}</span>
        </span>
        <Pill :tone="stateTone(it.state)">{{ stateLabel(it.state) }}</Pill>
      </div>
    </AppCard>

    <!-- 현장 확인 항목 -->
    <AppCard v-if="snapshot.observations?.length" class="gap-1.5">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">현장 확인 항목</span>
      <div v-for="(o, i) in snapshot.observations" :key="i" class="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
        <span>{{ o.label }}</span>
        <span class="font-semibold text-ink">{{ observationValueLabel(o.value) }}</span>
      </div>
    </AppCard>

    <!-- 사진 (목업 grid2, 4:3) -->
    <section v-if="snapshot.images?.length" class="flex flex-col gap-2">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">사진</span>
      <div class="grid grid-cols-2 gap-2.5">
        <figure v-for="(img, i) in snapshot.images" :key="i" class="flex min-w-0 flex-col gap-1">
          <div class="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2">
            <img :src="img.data_base64" alt="" class="absolute inset-0 h-full w-full object-cover" />
          </div>
          <figcaption class="text-[11.5px] text-ink-3">{{ img.kind }} {{ img.caption }}</figcaption>
        </figure>
      </div>
    </section>

    <!-- AI 가이드 (요약/주의만 노출) -->
    <AppCard v-if="snapshot.aiGuide" class="gap-1.5">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">AI 점검 도우미</span>
      <p class="text-[12.5px] text-ink-2">{{ snapshot.aiGuide.summary }}</p>
    </AppCard>

    <!-- 최종 의견 -->
    <AppCard v-if="snapshot.finalOpinion" class="gap-1.5">
      <span class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">시공업자 최종 의견</span>
      <p class="whitespace-pre-line text-[13px] text-ink">{{ snapshot.finalOpinion }}</p>
    </AppCard>

    <p class="text-xs text-ink-3">{{ snapshot.caution }}</p>
  </article>
</template>
