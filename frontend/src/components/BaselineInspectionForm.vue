<script setup>
import { ref, computed } from 'vue';
import PhotoUploader from './PhotoUploader.vue';
import AppButton from './ui/AppButton.vue';
import AppCard from './ui/AppCard.vue';
import Banner from './ui/Banner.vue';
import Pill from './ui/Pill.vue';
import SegmentedControl from './ui/SegmentedControl.vue';
import { MAX_IMAGES_PER_ITEM } from '../lib/image.js';
import {
  BASELINE_STATES,
  isAbnormal,
  fromInspection,
  confirmZone,
  setItemState,
  needsPhoto,
  zoneStatus,
  summarize,
  buildSavePayload,
} from '../lib/baselineInspection.js';
import {
  applyCarryover,
  fromSavedCarryover,
  clearRepairCheck,
  afterStateChange,
  carryoverBadge,
  carryoverSummary,
  carryoverPayload,
  submitWarning,
  previewImages,
} from '../lib/carryoverView.js';

// 입주·퇴거 기준선 점검: 이상 항목만 기록한다. 카탈로그는 부모가 GET /api/item-catalog로 받아 넘긴다.
const props = defineProps({
  catalog: { type: Object, required: true }, // { zones, items }
  initialInspection: { type: Object, default: () => ({}) },
  // 이전 퇴거 기록 가져오기 (창 20, 입주 전 점검만). API 호출은 부모가 한다
  carryoverEnabled: { type: Boolean, default: false },
  carryoverSource: { type: Object, default: null }, // GET /api/units/:id/baseline-carryover 응답 (사진 미리보기)
  carryoverLoading: { type: Boolean, default: false },
  carryoverMessage: { type: String, default: '' },
});
const emit = defineEmits(['save', 'request-carryover']);

const model = ref({
  ...fromInspection(props.catalog, props.initialInspection),
  carryover: fromSavedCarryover(props.initialInspection?.carryover),
});
const activeZone = ref(props.catalog.zones[0]);

const STATE_OPTIONS = BASELINE_STATES.map((s) => ({ value: s.code, label: s.label }));

const zoneItems = computed(() => props.catalog.items.filter((it) => it.zone === activeZone.value));
const activeStatus = computed(() => zoneStatus(model.value, props.catalog, activeZone.value));
const summary = computed(() => summarize(model.value, props.catalog));
const carrySummary = computed(() => carryoverSummary(model.value, props.catalog));

function statusOf(zone) {
  return zoneStatus(model.value, props.catalog, zone);
}

function onConfirmZone() {
  const { abnormal } = activeStatus.value;
  if (abnormal > 0 && !window.confirm(`${activeZone.value}의 이상 항목 ${abnormal}개를 모두 정상으로 되돌릴까요?`)) return;
  model.value = confirmZone(model.value, props.catalog, activeZone.value);
}

function onState(code, state) {
  model.value = afterStateChange(setItemState(model.value, props.catalog, code, state), code, state);
}

function onRequestCarryover() {
  if (model.value.carryover && !window.confirm('이전 퇴거 기록을 다시 가져오면 가져온 항목의 입력을 덮어씁니다. 계속할까요?')) return;
  emit('request-carryover');
}

/** 부모가 가져오기 응답을 받으면 호출한다. 구역 확인은 가져오지 않는다. */
function applyCarryoverSource(source) {
  model.value = applyCarryover(model.value, props.catalog, source);
  save();
}

function onClearRepairCheck(code) {
  model.value = clearRepairCheck(model.value, code);
  save();
}

function onPhotos(code, imgs) {
  model.value = { ...model.value, photos: { ...model.value.photos, [code]: imgs.map((i) => ({ ...i })) } };
  save(); // 사진은 추가 즉시 저장(PhotoUploader 동작과 같음)
}

function getPayload() {
  return { ...buildSavePayload(model.value, props.catalog), ...carryoverPayload(model.value) };
}

function getSubmitWarning() {
  return submitWarning(model.value, props.catalog);
}

function save() {
  emit('save', getPayload());
}

// 부모(InspectionEdit)가 제출 직전에 현재 입력을 함께 저장하도록 노출한다.
defineExpose({ getPayload, getSubmitWarning, applyCarryoverSource });
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <!-- 이전 퇴거 기록 가져오기 (창 20, 입주 전 점검만) -->
    <AppCard v-if="carryoverEnabled" class="gap-2">
      <div class="flex flex-col gap-0.5">
        <p class="text-[14px] font-semibold">퇴거 리포트가 다음 입주의 기준선이 됩니다</p>
        <p class="text-[12.5px] text-ink-3">
          가장 최근 퇴거 리포트의 이상 항목을 제안 상태로 채웁니다. 구역 확인은 새로 해야 합니다.
          <span v-if="model.carryover">(퇴거 리포트 #{{ model.carryover.sourceReportId }}<span v-if="model.carryover.sourceDate"> · <span class="num">{{ model.carryover.sourceDate }}</span></span>)</span>
        </p>
        <p v-if="carryoverMessage" class="text-xs text-warn" data-test="carryover-message">{{ carryoverMessage }}</p>
      </div>
      <AppButton variant="ghost" data-test="carryover-button" :disabled="carryoverLoading" @click="onRequestCarryover">
        {{ carryoverLoading ? '가져오는 중…' : '이전 퇴거 기록 가져오기' }}
      </AppButton>
    </AppCard>

    <!-- 구역 탭 (목업 .zonetabs, 선택은 ink 바탕) -->
    <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="구역">
      <button
        v-for="z in catalog.zones"
        :key="z"
        type="button"
        class="flex-none whitespace-nowrap rounded-[9px] border px-2.5 py-1.5 text-[12.5px]"
        :class="activeZone === z ? 'border-ink bg-ink font-semibold text-surface' : 'border-line bg-surface text-ink-2'"
        :aria-pressed="activeZone === z ? 'true' : 'false'"
        @click="activeZone = z"
      >
        {{ z }}
        <span v-if="statusOf(z).abnormal > 0" class="ml-0.5" :class="activeZone === z ? '' : 'text-warn'">이상 {{ statusOf(z).abnormal }}</span>
        <span v-else-if="statusOf(z).confirmed" class="ml-0.5" :class="activeZone === z ? '' : 'text-ok'">✓ 확인</span>
      </button>
    </div>

    <h3 class="text-[17px] font-bold tracking-tight">
      {{ activeZone }} <span class="text-[12.5px] font-normal text-ink-3">({{ zoneItems.length }}개 항목)</span>
    </h3>
    <Banner v-if="activeStatus.confirmed" tone="ok"><b>✓ 이 구역 이상 없음 확인됨</b></Banner>
    <AppButton v-else variant="ghost" @click="onConfirmZone">이 구역 이상 없음 · 한 번에 확인</AppButton>

    <AppCard class="gap-3">
      <div
        v-for="it in zoneItems"
        :key="it.code"
        class="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0"
        :class="carryoverBadge(model, it.code)?.pending ? '-mx-2 rounded-[10px] bg-warn-soft px-2 pb-2 ring-1 ring-warn' : ''"
        :data-test="`item-${it.code}`"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <b class="text-[14px]">{{ it.name }}</b>
          <Pill :tone="it.tier === 'core' ? 'dark' : 'plain'">{{ it.tier === 'core' ? '핵심' : '일반' }}</Pill>
          <template v-if="carryoverBadge(model, it.code)">
            <span
              class="inline-flex items-center whitespace-nowrap rounded-chip px-2 py-0.5 text-[11.5px] font-semibold"
              :class="carryoverBadge(model, it.code).class"
              data-test="carryover-badge"
            >
              {{ carryoverBadge(model, it.code).label }}
            </span>
            <span class="text-xs text-ink-3">{{ carryoverBadge(model, it.code).reason }}</span>
          </template>
        </div>
        <SegmentedControl
          :options="STATE_OPTIONS"
          :model-value="model.entries[it.code].state"
          :aria-label="`${it.name} 상태`"
          @update:model-value="(v) => onState(it.code, v)"
        />

        <!-- 가져온 항목: 퇴거 사진 작은 미리보기 + 수리 확인 표시 -->
        <div v-if="carryoverBadge(model, it.code)" class="flex flex-wrap items-center gap-2">
          <img
            v-for="(img, i) in previewImages(carryoverSource, it.code)"
            :key="i"
            :src="img.data_base64"
            :alt="img.caption ?? '퇴거 사진'"
            :title="`퇴거 사진 · ${img.caption ?? ''}`"
            class="aspect-[4/3] w-16 rounded-lg border border-line object-cover"
          />
          <template v-if="carryoverBadge(model, it.code).pending">
            <span class="text-xs text-warn">현장에서 수리됐는지 확인한 뒤 표시를 지워 주세요.</span>
            <button
              type="button"
              class="rounded-[9px] border border-warn bg-surface px-[11px] py-[7px] text-[12.5px] font-semibold text-warn"
              data-test="clear-repair-check"
              @click="onClearRepairCheck(it.code)"
            >
              수리 확인 완료
            </button>
          </template>
        </div>

        <template v-if="isAbnormal(model.entries[it.code].state)">
          <input
            v-model="model.entries[it.code].description"
            placeholder="메모 (예: 창문 옆 벽지 찢어짐 10cm)"
            class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <p
            v-if="needsPhoto(it, model.entries[it.code].state)"
            class="text-[12.5px]"
            :class="model.photos[it.code]?.length ? 'text-ink-2' : 'font-semibold text-crit'"
          >
            사진 필수 — 핵심 항목에 이상이 있으면 사진이 1장 이상 필요합니다.
          </p>
          <PhotoUploader
            :title="`${it.name} 사진`"
            :max="MAX_IMAGES_PER_ITEM"
            :initial-images="model.photos[it.code] ?? []"
            @save="(imgs) => onPhotos(it.code, imgs)"
          />
        </template>
      </div>
    </AppCard>

    <!-- 제출 전 요약 + 저장 -->
    <AppCard class="gap-2">
      <!-- 구역 확인 현황 (목업 .zgrid): 확인된 구역 ok, 이상 기록이 있는 구역 warn -->
      <div class="grid grid-cols-4 gap-1.5" data-test="zone-grid">
        <span
          v-for="z in catalog.zones"
          :key="z"
          class="truncate rounded-[9px] px-1 py-1.5 text-center text-[11.5px]"
          :class="
            statusOf(z).confirmed
              ? 'bg-ok-soft font-semibold text-ok'
              : statusOf(z).abnormal > 0
                ? 'bg-warn-soft font-semibold text-warn'
                : 'bg-surface-2 text-ink-3'
          "
        >{{ z }}</span>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[12.5px] text-ink-2" data-test="baseline-summary">
          항목 <span class="num">{{ summary.itemCount }}</span> · 구역 확인 <span class="num">{{ summary.zonesDone }}/{{ summary.zoneCount }}</span> · 이상
          <span class="num">{{ summary.abnormalCount }}</span> · 사진 <span class="num">{{ summary.photoCount }}</span>
        </p>
        <AppButton sm @click="save">저장</AppButton>
      </div>
      <p v-if="carrySummary" class="text-xs text-seal" data-test="carryover-summary">
        {{ carrySummary.text }}
        <span v-if="carrySummary.pending" class="font-semibold text-warn">— 노란 표시 항목은 현장 확인이 필요합니다.</span>
      </p>
      <p v-if="summary.unconfirmedZones.length" class="text-[12.5px] text-ink-3">
        확인하지 않은 구역: {{ summary.unconfirmedZones.join(', ') }}
      </p>
      <p v-if="summary.missingPhotos.length" class="text-xs text-crit">
        사진이 필요한 항목: {{ summary.missingPhotos.map((it) => `${it.zone} ${it.name}`).join(', ') }}
      </p>
      <p v-if="model.extraImages.length" class="text-xs text-ink-3">
        항목에 연결되지 않은 사진 {{ model.extraImages.length }}장은 그대로 보존됩니다.
      </p>
    </AppCard>
  </div>
</template>
