<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { comparePreselect } from '../lib/ownerHome.js';
import ReportSnapshotView from '../components/ReportSnapshotView.vue';
import DiffView from '../components/DiffView.vue';
import AppButton from '../components/ui/AppButton.vue';
import Banner from '../components/ui/Banner.vue';

const route = useRoute();
const reports = ref([]);
const leftId = ref('');
const rightId = ref('');
const result = ref(null);
const error = ref('');
const loading = ref(false);
// 입주↔퇴거 비교(diff)의 변경 없는 항목 목록용. 실패해도 비교는 보여 준다.
const catalog = ref(null);

onMounted(async () => {
  try {
    reports.value = (await apiFetch('/api/reports')).reports;
  } catch (e) {
    error.value = e.message;
    return;
  }
  // query(leftId, rightId)로 들어오면 미리 선택하고 바로 비교 (창 14 — 홈의 퇴거 카드). 없으면 기존 동작.
  const pre = comparePreselect(route.query, reports.value);
  leftId.value = pre.leftId;
  rightId.value = pre.rightId;
  if (pre.ready) await compare();
});

async function compare() {
  error.value = '';
  result.value = null;
  if (!leftId.value || !rightId.value) {
    error.value = '비교할 리포트 2개를 선택하세요.';
    return;
  }
  loading.value = true;
  try {
    const data = await apiFetch(`/api/reports/compare?leftId=${leftId.value}&rightId=${rightId.value}`);
    if (data.diff && !catalog.value) catalog.value = await apiFetch('/api/item-catalog').catch(() => null);
    result.value = data;
  } catch (e) {
    error.value = e.message; // 같은 호실/유형 아님 등 백엔드 메시지
  } finally {
    loading.value = false;
  }
}

const optionLabel = (r) => `${r.building} ${r.unitName} · ${r.typeLabel} (${r.grade})`;
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <h2 class="text-xl font-bold tracking-tight">리포트 비교</h2>
    <p class="text-xs text-ink-3">같은 호실 + 같은 점검 유형 2개를 비교합니다. (수리 전/후, 입주 전/퇴거는 예외 허용)</p>

    <!-- 리포트 선택 (목업 compare: 위아래로 쌓기) -->
    <div class="flex flex-col gap-1.5">
      <select v-model="leftId" class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[12.5px] text-ink">
        <option value="">왼쪽 리포트</option>
        <option v-for="r in reports" :key="r.id" :value="r.id">{{ optionLabel(r) }}</option>
      </select>
      <span class="text-center text-[11.5px] text-ink-3">vs</span>
      <select v-model="rightId" class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[12.5px] text-ink">
        <option value="">오른쪽 리포트</option>
        <option v-for="r in reports" :key="r.id" :value="r.id">{{ optionLabel(r) }}</option>
      </select>
      <AppButton variant="ghost" :disabled="loading" @click="compare">비교</AppButton>
    </div>

    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <DiffView v-if="result?.diff" :result="result" :catalog="catalog" />

    <div v-else-if="result" class="flex flex-col gap-3.5">
      <Banner v-if="result.compareMeta.isRepairBeforeAfter" tone="seal">수리 전/후 비교입니다.</Banner>
      <!-- ReportSnapshotView가 공간별 카드라 겉 카드 없이 구분선으로 나눈다 (창 23) -->
      <ReportSnapshotView :snapshot="result.left" />
      <div class="h-px bg-line"></div>
      <ReportSnapshotView :snapshot="result.right" />
    </div>
  </section>
</template>
