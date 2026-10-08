<script setup>
import { ref, computed } from 'vue';
import { ISSUE_FIELDS, ISSUE_SEVERITIES, OBSERVATION_VALUES, itemsForField } from '../domain/issueFields.js';
import {
  fromInspection,
  buildSavePayload,
  newIssueItem,
  newObservation,
  splitImages,
  buildImagesPayload,
  repairPhotoSummary,
} from '../lib/issueInspection.js';
import { MAX_IMAGES_PER_ITEM } from '../lib/image.js';
import AppButton from './ui/AppButton.vue';
import AppCard from './ui/AppCard.vue';
import PhotoUploader from './PhotoUploader.vue';

const props = defineProps({
  initialItems: { type: Array, default: () => [] },
  initialObservations: { type: Array, default: () => [] },
  // 수리 전·수리 후 점검(창 26): 항목마다 사진 칸 + 사진 필수 표시. 사진은 이 폼이 items와 함께 저장한다
  photoRequired: { type: Boolean, default: false },
  initialImages: { type: Array, default: () => [] },
});
const emit = defineEmits(['save']);

let nextKey = 0;
const withKey = (it) => ({ ...it, _key: nextKey++ }); // 항목 삭제 뒤에도 사진 칸이 섞이지 않게
const restored = fromInspection(props.initialItems, props.initialObservations);
const items = ref((restored.length ? restored : [newIssueItem()]).map(withKey));
const split = splitImages(props.initialItems, props.initialImages);
const photos = ref(restored.length ? split.photos : [[]]);
const extraImages = split.extraImages; // 항목에 붙지 않은 예전 사진은 그대로 보존

const photoSummary = computed(() => repairPhotoSummary(photos.value));

function addItem() {
  items.value.push(withKey(newIssueItem()));
  photos.value.push([]);
}
function removeItem(idx) {
  items.value.splice(idx, 1);
  photos.value.splice(idx, 1);
}
function onFieldChange(item) {
  // 분야가 바뀌면 항목 목록이 달라지므로 선택 초기화
  if (!itemsForField(item.category).includes(item.name)) item.name = '';
}
function addObservation(item) {
  item.observations.push(newObservation());
}
function removeObservation(item, oi) {
  item.observations.splice(oi, 1);
}
function onPhotos(idx, imgs) {
  photos.value[idx] = imgs.map((i) => ({ ...i }));
  save(); // 사진은 추가 즉시 저장(PhotoUploader 동작과 같음)
}
function getPayload() {
  const payload = buildSavePayload(items.value);
  return props.photoRequired ? { ...payload, images: buildImagesPayload(photos.value, extraImages) } : payload;
}
function save() {
  emit('save', getPayload());
}

defineExpose({ getPayload });
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <AppCard v-for="(item, idx) in items" :key="item._key" class="gap-3">
      <div class="flex items-center justify-between">
        <h3 class="text-[15px] font-semibold">
          문제 항목 {{ idx + 1 }}
          <span
            v-if="photoRequired"
            data-test="repair-photo-required"
            class="ml-1 rounded-chip px-2 py-0.5 align-middle text-[11.5px] font-semibold"
            :class="photos[idx]?.length ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'"
          >
            사진 필수
          </span>
        </h3>
        <button type="button" class="text-xs font-semibold text-crit" @click="removeItem(idx)">삭제</button>
      </div>

      <div class="flex flex-col gap-2">
        <select v-model="item.category" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" @change="onFieldChange(item)">
          <option value="" disabled>분야 선택</option>
          <option v-for="f in ISSUE_FIELDS" :key="f.field" :value="f.field">{{ f.field }}</option>
        </select>
        <select v-model="item.name" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink disabled:bg-surface-2 disabled:text-ink-3" :disabled="!item.category">
          <option value="" disabled>문제 항목 선택</option>
          <option v-for="name in itemsForField(item.category)" :key="name" :value="name">{{ name }}</option>
        </select>
      </div>

      <div class="flex flex-wrap gap-1">
        <button
          v-for="s in ISSUE_SEVERITIES"
          :key="s.code"
          type="button"
          class="rounded-chip border px-[11px] py-1.5 text-[12.5px]"
          :class="item.state === s.code ? 'border-ink bg-ink font-semibold text-surface' : 'border-line bg-surface text-ink-2'"
          @click="item.state = s.code"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <input v-model="item.location" placeholder="위치 (예: 안방 천장)" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
        <input v-model="item.description" placeholder="증상 설명" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
      </div>

      <!-- 현장 확인 항목 -->
      <div class="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-3">
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold text-ink-2">현장 확인 항목</span>
          <button type="button" class="text-[13px] font-semibold text-accent" @click="addObservation(item)">+ 추가</button>
        </div>
        <p v-if="!item.observations.length" class="text-xs text-ink-3">필요 시 확인 항목을 추가하세요.</p>
        <div v-for="(obs, oi) in item.observations" :key="oi" class="flex flex-wrap items-center gap-2">
          <input v-model="obs.label" placeholder="확인 항목 (예: 곰팡이 흔적)" class="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
          <div class="flex gap-1">
            <button
              v-for="v in OBSERVATION_VALUES"
              :key="v.code"
              type="button"
              class="rounded-lg border px-2 py-1 text-xs"
              :class="obs.value === v.code ? 'border-ink bg-ink font-semibold text-surface' : 'border-line bg-surface text-ink-2'"
              @click="obs.value = v.code"
            >
              {{ v.label }}
            </button>
          </div>
          <button type="button" class="text-xs font-semibold text-crit" @click="removeObservation(item, oi)">×</button>
        </div>
      </div>

      <!-- 수리 전·후: 항목 사진 (1장 이상 필수) -->
      <PhotoUploader
        v-if="photoRequired"
        :title="`문제 항목 ${idx + 1} 사진`"
        :max="MAX_IMAGES_PER_ITEM"
        :initial-images="photos[idx] ?? []"
        @save="(imgs) => onPhotos(idx, imgs)"
      />
    </AppCard>

    <button
      type="button"
      class="w-full rounded-btn border border-dashed border-line bg-surface py-3 text-[13px] font-semibold text-ink-2 hover:border-accent"
      @click="addItem"
    >
      + 문제 항목 추가
    </button>

    <div class="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 py-2.5">
      <p
        v-if="photoRequired"
        data-test="repair-photo-summary"
        class="text-[12.5px]"
        :class="photoSummary.ok ? 'text-ok' : 'font-semibold text-crit'"
      >
        {{ photoSummary.text }} — 수리 전·수리 후 점검은 항목마다 사진이 1장 이상 필요합니다.
      </p>
      <AppButton @click="save">저장</AppButton>
    </div>
  </div>
</template>
