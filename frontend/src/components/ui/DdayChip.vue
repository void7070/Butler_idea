<script setup>
import { DDAY_TONE } from '../../lib/uiTones.js';

// 목업 .dday (crit·warn·calm). 창 28: 글꼴은 부르는 쪽이 <NumText>로 숫자 부분만 mono
defineProps({
  severity: { type: String, default: 'calm' },
});
</script>

<template>
  <span
    class="shrink-0 whitespace-nowrap rounded-[7px] px-2 py-[3px] text-[12.5px] font-semibold"
    :class="DDAY_TONE[severity] ?? DDAY_TONE.calm"
  ><slot /></span>
</template>
