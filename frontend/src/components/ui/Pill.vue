<script setup>
import { PILL_TONE } from '../../lib/uiTones.js';

// 목업 .pill (ok·warn·crit·seal·acc·plain·dark)
defineProps({
  tone: { type: String, default: 'plain' },
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-[11.5px] font-semibold"
    :class="PILL_TONE[tone] ?? PILL_TONE.plain"
  ><slot /></span>
</template>
