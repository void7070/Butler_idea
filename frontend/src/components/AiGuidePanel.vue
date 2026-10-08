<script setup>
// 표현 전용 컴포넌트. AI 호출은 부모가 수행하고, 여기서는 결과만 렌더한다.
import AppButton from './ui/AppButton.vue';
import Banner from './ui/Banner.vue';

defineProps({
  guide: { type: Object, default: null },
  fallback: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['request', 'apply']);
</script>

<template>
  <div class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">AI 점검 도우미</h3>
      <AppButton variant="ghost" sm data-test="request" :disabled="loading" @click="emit('request')">
        {{ loading ? '생성 중…' : 'AI 도우미 호출' }}
      </AppButton>
    </div>

    <Banner v-if="fallback" tone="warn" class="text-xs">
      AI 응답을 받지 못해 기본 안내를 표시합니다. 의견은 직접 작성할 수 있습니다.
    </Banner>

    <template v-if="guide">
      <p class="text-[13px] text-ink-2" data-test="summary">{{ guide.summary }}</p>

      <div v-if="guide.actionCards?.length" class="flex flex-col gap-2">
        <div v-for="(c, i) in guide.actionCards" :key="i" class="rounded-[10px] bg-surface-2 px-3 py-2">
          <div class="text-[13px] font-semibold">{{ c.title }}</div>
          <div class="text-xs text-ink-3">{{ c.detail }}</div>
        </div>
      </div>

      <div v-if="guide.requiredDocuments?.length">
        <h4 class="text-xs font-medium text-ink-3">필요 자료</h4>
        <ul class="list-inside list-disc text-[13px] text-ink-2">
          <li v-for="(d, i) in guide.requiredDocuments" :key="i">{{ d }}</li>
        </ul>
      </div>

      <div v-if="guide.cautionPhrases?.length">
        <h4 class="text-xs font-medium text-ink-3">표현 주의</h4>
        <ul class="list-inside list-disc text-[13px] text-ink-2">
          <li v-for="(p, i) in guide.cautionPhrases" :key="i">{{ p }}</li>
        </ul>
      </div>

      <div v-if="guide.opinionDraft" class="rounded-[10px] border border-line p-3">
        <div class="mb-1 flex items-center justify-between">
          <h4 class="text-xs font-medium text-ink-3">의견 초안</h4>
          <button
            type="button"
            data-test="apply"
            class="text-[13px] font-semibold text-accent"
            @click="emit('apply', guide.opinionDraft)"
          >
            최종 의견에 적용
          </button>
        </div>
        <p class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2">{{ guide.opinionDraft }}</p>
      </div>
    </template>
  </div>
</template>
