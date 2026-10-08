<script setup>
// 목업 .chip (선택하면 accent). 누르는 동작은 부모가 @click으로.
defineProps({
  pressed: { type: Boolean, default: false },
});
</script>

<template>
  <button
    type="button"
    class="rounded-chip border px-[11px] py-1.5 text-[12.5px]"
    :class="pressed ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line bg-surface text-ink-2'"
    :aria-pressed="pressed ? 'true' : 'false'"
  ><slot /></button>
</template>
