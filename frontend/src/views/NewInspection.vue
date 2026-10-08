<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { INSPECTION_TYPES } from '../domain/inspectionTypes.js';
import AppButton from '../components/ui/AppButton.vue';
import Chip from '../components/ui/Chip.vue';

// 선택한 유형의 작성 방식 안내 (작성 화면은 InspectionEdit이 flow에 따라 고른다)
const FLOW_HINTS = {
  baseline: '구역·항목 카탈로그 기준으로 이상 항목만 기록합니다. 이상 없는 구역은 한 번에 확인할 수 있습니다.',
  whole: '공간별 전체 항목을 점검합니다.',
  issue: '발견한 문제 항목만 추가해 기록합니다.',
};
const flowOf = (code) => INSPECTION_TYPES.find((t) => t.code === code)?.flow;

const router = useRouter();
const units = ref([]);
const selectedUnitId = ref(null);
const selectedType = ref('move_in');
const error = ref('');
const submitting = ref(false);

onMounted(async () => {
  try {
    const data = await apiFetch('/api/units');
    units.value = data.units;
    if (units.value.length) selectedUnitId.value = units.value[0].id;
  } catch (e) {
    error.value = e.message;
  }
});

async function start() {
  error.value = '';
  if (!selectedUnitId.value) {
    error.value = '점검 대상 호실을 선택하세요.';
    return;
  }
  submitting.value = true;
  try {
    const data = await apiFetch('/api/inspections', {
      method: 'POST',
      body: JSON.stringify({ unitId: selectedUnitId.value, type: selectedType.value }),
    });
    router.push(`/contractor/inspections/${data.inspection.id}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <h2 class="text-xl font-bold tracking-tight">새 점검 시작</h2>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <div class="flex flex-col gap-[5px]">
      <label class="text-xs font-medium text-ink-2">점검 유형</label>
      <div class="flex flex-wrap gap-1.5">
        <Chip v-for="t in INSPECTION_TYPES" :key="t.code" :pressed="selectedType === t.code" @click="selectedType = t.code">
          {{ t.label }}
        </Chip>
      </div>
      <p class="text-xs text-ink-3">{{ FLOW_HINTS[flowOf(selectedType)] }}</p>
    </div>

    <div class="flex flex-col gap-[5px]">
      <label class="text-xs font-medium text-ink-2">점검 대상 호실</label>
      <div class="flex flex-wrap gap-1.5">
        <Chip v-for="u in units" :key="u.id" :pressed="selectedUnitId === u.id" @click="selectedUnitId = u.id">
          {{ u.building_name }} {{ u.name }}
        </Chip>
      </div>
    </div>

    <AppButton :disabled="submitting" @click="start">점검 시작</AppButton>
  </section>
</template>
