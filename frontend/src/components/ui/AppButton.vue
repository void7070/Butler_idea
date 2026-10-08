<script setup>
import { computed } from 'vue';

// 목업 .btn / .btn.ghost / .btn.seal / .btn.sm. as = 태그나 컴포넌트(RouterLink 등), 나머지 속성(to, disabled, onClick…)은 그대로 전달.
const props = defineProps({
  as: { type: [String, Object], default: 'button' },
  variant: { type: String, default: 'primary' }, // 'primary' | 'ghost' | 'seal'
  sm: { type: Boolean, default: false },
});
const classes = computed(() => [
  'inline-flex items-center justify-center gap-1.5 font-semibold transition hover:brightness-105',
  'disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-line disabled:bg-surface-2 disabled:text-ink-3 disabled:hover:brightness-100',
  props.sm ? 'rounded-[9px] px-[11px] py-[7px] text-[12.5px]' : 'w-full rounded-btn px-3.5 py-3 text-[14.5px]',
  props.variant === 'ghost'
    ? 'border border-line bg-surface text-ink'
    : props.variant === 'seal'
      ? 'bg-seal text-white'
      : 'bg-accent text-accent-ink',
]);
</script>

<template>
  <component :is="as" :type="as === 'button' ? 'button' : undefined" :class="classes"><slot /></component>
</template>
