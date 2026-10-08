<script setup>
// 창 28: 문구는 그대로, 숫자·날짜·금액 부분만 <span class="num">으로 감싼다(한글은 기본 글꼴).
import { computed } from 'vue';
import { splitNum } from '../../lib/numText.js';

const props = defineProps({
  text: { type: [String, Number], default: '' },
});
const parts = computed(() => splitNum(props.text));
</script>

<template><template v-for="(p, i) in parts" :key="i"><span v-if="p.num" class="num">{{ p.text }}</span><template v-else>{{ p.text }}</template></template></template>
