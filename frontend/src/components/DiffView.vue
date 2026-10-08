<script setup>
// 입주 ↔ 퇴거 비교: 달라진 항목만 보여 준다 (progress.md 창 5).
// 비교 결과(result)와 카탈로그는 부모가 불러서 props로 넘긴다.
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  stateBadge,
  evidenceBadge,
  tierLabel,
  sortChanges,
  summaryCounts,
  pickSnapshots,
  formatDate,
  moveInPhotoCell,
  moveOutPhotoCell,
  unchangedByZone,
  settlementButton,
} from '../lib/diffView.js';
import AppCard from './ui/AppCard.vue';
import AppButton from './ui/AppButton.vue';
import Pill from './ui/Pill.vue';

const props = defineProps({
  result: { type: Object, required: true }, // GET /api/reports/compare 응답 (diff 있음)
  catalog: { type: Object, default: null }, // GET /api/item-catalog (변경 없는 항목 목록용)
});

const router = useRouter();

const snapshots = computed(() => pickSnapshots(props.result));
const counts = computed(() => summaryCounts(props.result.diff));
const changes = computed(() =>
  sortChanges(props.result.diff.changes, props.catalog?.zones ?? []).map((c) => ({
    ...c,
    moveInCell: moveInPhotoCell(c, snapshots.value.moveIn),
    moveOutCell: moveOutPhotoCell(c),
  }))
);
const unchanged = computed(() => unchangedByZone(props.catalog, props.result.diff.changes));
const settlement = computed(() => settlementButton((name) => router.hasRoute(name), props.result.diff));

function goSettlement() {
  if (settlement.value.enabled) router.push(settlement.value.to);
}
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <!-- 상단 요약 (목업 compare) -->
    <AppCard as="header" class="gap-1">
      <span class="text-[12.5px] text-ink-3">{{ snapshots.moveIn.unit.building }} {{ snapshots.moveIn.unit.name }}</span>
      <div class="flex flex-wrap items-center gap-1.5">
        <b class="text-[13px]">
          입주 <span class="num">{{ formatDate(snapshots.moveIn.generatedAt) }}</span> → {{ snapshots.moveOut.inspection.typeLabel }}
          <span class="num">{{ formatDate(snapshots.moveOut.generatedAt) }}</span>
        </b>
        <Pill tone="plain">같은 호실</Pill>
      </div>
      <p class="text-[12.5px] text-ink-2" data-test="diff-summary">
        <b class="text-crit">변경 {{ counts.changed }}</b> · 변경 없음 {{ counts.unchanged }}
      </p>
    </AppCard>

    <!-- 변경 항목 카드 -->
    <p v-if="changes.length === 0" class="rounded-btn bg-ok-soft px-3.5 py-3 text-[13px] text-ok">
      입주 때보다 나빠진 항목이 없습니다.
    </p>
    <AppCard v-for="c in changes" :key="c.itemCode" as="article" data-test="diff-card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="flex min-w-0 flex-wrap items-center gap-1.5">
          <span class="text-[12.5px] text-ink-3">{{ c.zone }}</span>
          <h3 class="text-[15px] font-semibold">{{ c.name }}</h3>
          <Pill :tone="c.tier === 'core' ? 'dark' : 'plain'">{{ tierLabel(c.tier) }}</Pill>
        </span>
        <Pill :tone="evidenceBadge(c.evidence).tone">{{ evidenceBadge(c.evidence).label }}</Pill>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <Pill :tone="stateBadge(c.from).tone">입주 {{ stateBadge(c.from).label }}</Pill>
        <span class="text-[12.5px] text-ink-3">→</span>
        <Pill :tone="stateBadge(c.to).tone">퇴거 {{ stateBadge(c.to).label }}</Pill>
        <!-- 임차인 입주 제보 (창 10) -->
        <Pill v-if="c.tenantReported" tone="ok">임차인 제보 승인 반영</Pill>
        <Pill v-if="c.disputed" tone="crit" data-test="disputed">다툼 · 입주 제보 거절됨</Pill>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div v-for="(cell, side) in { 입주: c.moveInCell, 퇴거: c.moveOutCell }" :key="side" class="flex flex-col gap-[3px]">
          <span class="text-[12.5px] text-ink-3">
            {{ side }} 사진<span v-if="cell.overview"> (구역 전경)</span>
          </span>
          <template v-if="cell.images.length">
            <img
              v-for="(img, i) in cell.images"
              :key="i"
              :src="img.data_base64"
              alt=""
              class="aspect-[4/3] w-full rounded-[10px] object-cover"
            />
          </template>
          <div
            v-else
            class="grid aspect-[4/3] place-items-center rounded-[10px] border border-dashed border-line bg-surface-2 p-1.5 text-center text-[11px] text-ink-3"
          >
            {{ cell.emptyText }}
          </div>
        </div>
      </div>
    </AppCard>

    <!-- 변경 없는 항목 (접힘) -->
    <details class="group flex flex-col rounded-card border border-line bg-surface p-3.5">
      <summary class="flex cursor-pointer list-none justify-between text-[13px] text-ink-2 [&::-webkit-details-marker]:hidden">
        <span><span class="inline-block transition-transform group-open:rotate-90">▸</span> 변경 없는 항목 {{ counts.unchanged }}개</span>
      </summary>
      <div v-if="unchanged.length" class="mt-2 flex flex-col gap-1.5 text-[12.5px] text-ink-2">
        <div v-for="g in unchanged" :key="g.zone">
          <span class="font-semibold text-ink">{{ g.zone }}</span>
          <span> · {{ g.items.map((it) => it.name).join(', ') }}</span>
        </div>
      </div>
      <p v-else class="mt-2 text-[12.5px] text-ink-3">항목 목록을 불러오지 못했습니다.</p>
    </details>

    <!-- 정산 화면으로 -->
    <div class="flex flex-col gap-1">
      <AppButton :disabled="!settlement.enabled" data-test="settlement-button" @click="goSettlement">
        보증금 공제 근거 만들기
      </AppButton>
      <p v-if="settlement.notice" class="text-[12.5px] text-ink-3">{{ settlement.notice }}</p>
    </div>
  </div>
</template>
