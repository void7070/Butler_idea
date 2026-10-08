<script setup>
import { ref, computed } from 'vue';
import { SPACES, WHOLE_STATES } from '../domain/inspectionSpaces.js';
import { buildInitialItems } from '../lib/wholeInspection.js';
import AppButton from './ui/AppButton.vue';
import AppCard from './ui/AppCard.vue';

const props = defineProps({
  initialItems: { type: Array, default: () => [] },
});
const emit = defineEmits(['save']);

// 평평한 항목 배열을 만들고, 화면에서는 공간별로 그룹화해 보여준다.
const items = ref(buildInitialItems(props.initialItems));

const grouped = computed(() =>
  SPACES.map(({ space }) => ({
    space,
    entries: items.value.filter((i) => i.category === space),
  }))
);

const STATE_CLASS = {
  normal: 'border-ok bg-ok text-surface',
  caution: 'border-warn bg-warn text-surface',
  repair: 'border-crit bg-crit text-surface',
};

function save() {
  emit('save', { items: items.value });
}
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <AppCard v-for="group in grouped" :key="group.space" class="gap-3">
      <h3 class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">{{ group.space }}</h3>
      <div
        v-for="entry in group.entries"
        :key="entry.name"
        class="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-[14px] font-semibold">{{ entry.name }}</span>
          <div class="flex gap-1">
            <button
              v-for="s in WHOLE_STATES"
              :key="s.code"
              type="button"
              class="rounded-lg border px-2.5 py-1 text-xs"
              :class="entry.state === s.code ? STATE_CLASS[s.code] : 'border-line bg-surface text-ink-2'"
              @click="entry.state = s.code"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <!-- 주의/수리 필요만 상세 입력 -->
        <div v-if="entry.state !== 'normal'" class="flex flex-col gap-2">
          <input v-model="entry.location" placeholder="위치 (예: 베란다측 창)" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
          <input v-model="entry.description" placeholder="설명 (예: 실리콘 들뜸)" class="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink" />
        </div>
      </div>
    </AppCard>

    <div class="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-2.5">
      <AppButton @click="save">저장</AppButton>
    </div>
  </div>
</template>
