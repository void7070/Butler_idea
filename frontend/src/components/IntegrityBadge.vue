<script setup>
// 변조 감지 뱃지 (창 9 리포트, 창 15 확정 정산서 kind="settlement").
// verify = { storedHash, currentHash, ok, ... } — 없으면 표시하지 않는다.
// 창 22: 목업 .sealbox — 정상은 seal 테두리 박스 + 자물쇠 + mono 해시, 변경 감지는 crit 박스. 문구는 integrityBadge 그대로.
import { computed } from 'vue';
import { integrityBadge } from '../lib/reportView.js';

const props = defineProps({
  verify: { type: Object, default: null },
  kind: { type: String, default: 'report' },
});
const badge = computed(() => integrityBadge(props.verify, props.kind));

// 문구를 바꾸지 않고 "SHA-256 앞4…뒤4" 부분만 mono로 감싼다.
const parts = computed(() => {
  const text = badge.value?.text ?? '';
  const m = text.match(/SHA-256 \S+/);
  if (!m) return { before: text, hash: '', after: '' };
  return { before: text.slice(0, m.index), hash: m[0], after: text.slice(m.index + m[0].length) };
});
</script>

<template>
  <p
    v-if="badge"
    class="flex items-start gap-1.5 rounded-card border-[1.5px] px-3.5 py-3 text-[13.5px] font-bold"
    :class="badge.class"
    :data-ok="badge.ok"
  >
    <svg
      v-if="badge.ok"
      class="mt-[3px] shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
    <svg
      v-else
      class="mt-[3px] shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
    <span class="min-w-0">{{ parts.before }}<span v-if="parts.hash" class="num">{{ parts.hash }}</span>{{ parts.after }}</span>
  </p>
</template>
