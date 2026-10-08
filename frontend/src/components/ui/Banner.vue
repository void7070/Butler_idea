<script setup>
import { BANNER_TONE, BANNER_STRONG } from '../../lib/uiTones.js';

// 목업 .banner (crit·ok·warn·plain). 굵은 글씨(<b>)는 배너 색.
defineProps({
  tone: { type: String, default: 'plain' },
});
</script>

<template>
  <div
    class="flex flex-col gap-1 rounded-btn px-3.5 py-3 text-[13px]"
    :class="[BANNER_TONE[tone] ?? BANNER_TONE.plain, BANNER_STRONG[tone] ?? '']"
  ><slot /></div>
</template>
