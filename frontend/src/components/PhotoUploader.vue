<script setup>
import { ref } from 'vue';
import {
  PHOTO_KINDS,
  MAX_IMAGES_PER_REPORT,
  isWithinSize,
  canAddMore,
  fileToDataUrl,
  fromInspectionImages,
} from '../lib/image.js';

import AppButton from './ui/AppButton.vue';

const props = defineProps({
  initialImages: { type: Array, default: () => [] },
  title: { type: String, default: '사진 첨부' },
  // 최대 장수 (기본 리포트당 20장, 항목별 사진 칸은 5장)
  max: { type: Number, default: MAX_IMAGES_PER_REPORT },
});
const emit = defineEmits(['save']);

const images = ref(fromInspectionImages(props.initialImages));
const error = ref('');

async function onSelect(event) {
  error.value = '';
  const files = Array.from(event.target.files ?? []);
  let added = false;
  for (const file of files) {
    if (!isWithinSize(file)) {
      error.value = `"${file.name}" 은 10MB를 초과합니다.`;
      continue;
    }
    if (!canAddMore(images.value.length, 1, props.max)) {
      error.value =
        props.max === MAX_IMAGES_PER_REPORT
          ? `이미지는 리포트당 최대 ${MAX_IMAGES_PER_REPORT}장입니다.`
          : `이 항목의 사진은 최대 ${props.max}장입니다.`;
      break;
    }
    const dataBase64 = await fileToDataUrl(file);
    images.value.push({ dataBase64, kind: '', caption: '' });
    added = true;
  }
  event.target.value = ''; // 같은 파일 재선택 허용
  // 추가 즉시 저장: '사진 저장'을 깜빡하고 제출해도 사진이 유실되지 않도록 자동 저장한다.
  if (added) save();
}

function remove(i) {
  images.value.splice(i, 1);
  save(); // 삭제도 즉시 반영
}

function save() {
  emit('save', images.value);
}
</script>

<template>
  <div class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-[14px] font-semibold">
        {{ title }} <span class="num text-xs font-normal text-ink-3">({{ images.length }}/{{ max }})</span>
      </h3>
      <div class="flex items-center gap-2">
        <AppButton as="label" variant="ghost" sm class="cursor-pointer">
          파일 선택
          <input type="file" accept="image/*" multiple class="hidden" @change="onSelect" />
        </AppButton>
        <button type="button" class="text-[13px] font-semibold text-accent" @click="save">사진 저장</button>
      </div>
    </div>

    <p v-if="error" class="rounded-[10px] bg-crit-soft px-3 py-2 text-xs text-crit">{{ error }}</p>
    <p v-if="!images.length" class="text-[12.5px] text-ink-3">첨부된 사진이 없습니다.</p>

    <!-- 목업 .photos: 3열, 4:3 -->
    <div v-if="images.length" class="grid grid-cols-3 gap-2">
      <div v-for="(img, i) in images" :key="i" class="flex min-w-0 flex-col gap-1">
        <div class="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2">
          <img :src="img.dataBase64" alt="" class="absolute inset-0 h-full w-full object-cover" />
          <button
            type="button"
            class="absolute right-1 top-1 rounded-full bg-ink/70 px-2 text-xs text-surface"
            @click="remove(i)"
          >
            ×
          </button>
        </div>
        <select v-model="img.kind" @change="save" class="w-full rounded-[10px] border border-line bg-surface px-2 py-1.5 text-xs text-ink">
          <option value="">사진 유형</option>
          <option v-for="k in PHOTO_KINDS" :key="k" :value="k">{{ k }}</option>
        </select>
        <input
          v-model="img.caption"
          @blur="save"
          placeholder="사진 설명"
          class="w-full rounded-[10px] border border-line bg-surface px-2 py-1.5 text-xs text-ink"
        />
      </div>
    </div>
  </div>
</template>
