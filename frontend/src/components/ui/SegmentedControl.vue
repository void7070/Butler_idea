<script setup>
// 목업 .seg. options = [{ value, label, disabled?, test? }], v-model = 선택 값 (test → 버튼 data-test)
defineProps({
  options: { type: Array, required: true },
  modelValue: { type: [String, Number, Boolean, null], default: null },
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="flex gap-[3px] rounded-[10px] bg-surface-2 p-[3px]" role="group">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      class="flex-1 rounded-lg px-1 py-[7px] text-[12.5px] disabled:cursor-not-allowed disabled:opacity-45"
      :class="o.value === modelValue ? 'bg-ink font-semibold text-surface' : 'text-ink-2'"
      :aria-pressed="o.value === modelValue ? 'true' : 'false'"
      :disabled="o.disabled"
      :data-test="o.test"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
