<script setup>
import { computed } from 'vue';
import { EDGE_TONE } from '../../lib/uiTones.js';

// 목업 .card / .card.tap / .card.edge-crit·warn·calm. as = 태그나 컴포넌트(RouterLink 등), 나머지 속성은 그대로 전달.
const props = defineProps({
  as: { type: [String, Object], default: 'div' },
  tap: { type: Boolean, default: false },
  edge: { type: String, default: null }, // 'crit' | 'warn' | 'calm'
});
const classes = computed(() => [
  'flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5',
  props.tap && 'w-full text-left transition-colors hover:border-accent',
  EDGE_TONE[props.edge],
]);
</script>

<template>
  <component :is="as" :class="classes"><slot /></component>
</template>
