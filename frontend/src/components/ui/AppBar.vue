<script setup>
// 목업 .appbar: 뒤로(선택) · 제목 · 오른쪽 메타. 제목·오른쪽은 슬롯으로 바꿀 수 있다. 뒤로는 'back' 이벤트만(이동은 부모가).
defineProps({
  title: { type: String, default: '' },
  back: { type: Boolean, default: false },
  meta: { type: String, default: '' },
});
const emit = defineEmits(['back']);
</script>

<template>
  <header class="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
    <button
      v-if="back"
      type="button"
      class="-ml-2 grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"
      aria-label="뒤로"
      @click="emit('back')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <h1 class="min-w-0 flex-1 truncate text-base font-semibold"><slot name="title">{{ title }}</slot></h1>
    <slot name="right"><span v-if="meta" class="text-xs text-ink-3">{{ meta }}</span></slot>
  </header>
</template>
