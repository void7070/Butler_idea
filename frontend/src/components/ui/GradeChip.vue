<script setup>
import { GRADE_TONE } from '../../lib/uiTones.js';

// 목업 .grade .g-A~E (mono)
defineProps({
  grade: { type: String, required: true },
});
</script>

<template>
  <span
    class="num inline-grid h-[26px] min-w-[26px] place-items-center rounded-[7px] px-1.5 text-[13px] font-bold"
    :class="GRADE_TONE[grade] ?? 'bg-surface-2 text-ink-2'"
  >{{ grade }}</span>
</template>
