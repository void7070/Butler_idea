<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { labelForType } from '../domain/inspectionTypes.js';
import { canCarryOver } from '../lib/carryoverView.js';
import { isRepairType, repairPreOptions } from '../lib/issueInspection.js';
import WholeInspectionForm from '../components/WholeInspectionForm.vue';
import IssueInspectionForm from '../components/IssueInspectionForm.vue';
import BaselineInspectionForm from '../components/BaselineInspectionForm.vue';
import PhotoUploader from '../components/PhotoUploader.vue';
import AiGuidePanel from '../components/AiGuidePanel.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import NumText from '../components/ui/NumText.vue';
import Banner from '../components/ui/Banner.vue';

const route = useRoute();
const router = useRouter();
const inspection = ref(null);
const error = ref('');
const loading = ref(true);
const savedAt = ref('');
// 입주·퇴거(baseline) 점검용 항목 카탈로그 (GET /api/item-catalog)
const catalog = ref(null);
const baselineForm = ref(null);
// 이전 퇴거 기록 가져오기 (창 20, 입주 전 점검만)
const carryoverSource = ref(null);
const carryoverLoading = ref(false);
const carryoverMessage = ref('');
// 수리 전·수리 후 점검 (창 26): 항목별 사진은 IssueInspectionForm이 저장, 수리 후는 수리 전 리포트 연결
const issueForm = ref(null);
const repairPreChoices = ref([]);
const repairPreReportId = ref('');

// 최종 의견
const finalOpinion = ref('');
// AI 가이드
const aiGuide = ref(null);
const aiFallback = ref(false);
const aiLoading = ref(false);
// 제출
const submitting = ref(false);
const submittedReportId = ref(null);

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch(`/api/inspections/${route.params.id}`);
    inspection.value = data.inspection;
    finalOpinion.value = data.inspection.final_opinion ?? '';
    if (data.inspection.flow === 'baseline') catalog.value = await apiFetch('/api/item-catalog');
    if (data.inspection.type === 'repair_post') {
      repairPreReportId.value = data.inspection.repairPreReportId ?? '';
      const list = await apiFetch('/api/reports').catch(() => ({ reports: [] }));
      repairPreChoices.value = repairPreOptions(list.reports, data.inspection.unit_id);
    }
    // 이미 가져온 적 있으면 퇴거 사진 미리보기용으로 다시 불러온다(실패해도 폼은 그대로)
    if (canCarryOver(data.inspection) && data.inspection.carryover) {
      carryoverSource.value = await apiFetch(`/api/units/${data.inspection.unit_id}/baseline-carryover`).catch(() => null);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function onSave(payload) {
  error.value = '';
  try {
    const data = await apiFetch(`/api/inspections/${route.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    inspection.value = data.inspection;
    savedAt.value = new Date().toLocaleTimeString();
  } catch (e) {
    error.value = e.message;
  }
}

async function loadCarryover() {
  carryoverLoading.value = true;
  carryoverMessage.value = '';
  try {
    const source = await apiFetch(`/api/units/${inspection.value.unit_id}/baseline-carryover`);
    carryoverSource.value = source;
    if (!source.items.length) {
      carryoverMessage.value = `퇴거 리포트 #${source.sourceReportId}에 이상 항목이 없어 가져올 것이 없습니다.`;
      return;
    }
    baselineForm.value?.applyCarryoverSource(source);
  } catch (e) {
    carryoverMessage.value = e.message; // 예: 이 호실에는 이전 퇴거 리포트가 없습니다.
  } finally {
    carryoverLoading.value = false;
  }
}

async function requestGuide() {
  aiLoading.value = true;
  error.value = '';
  try {
    const data = await apiFetch('/api/ai/inspection-guide', {
      method: 'POST',
      body: JSON.stringify({ inspectionId: Number(route.params.id) }),
    });
    aiGuide.value = data.guide;
    aiFallback.value = data.fallback;
  } catch (e) {
    error.value = e.message;
  } finally {
    aiLoading.value = false;
  }
}

function applyDraft(draft) {
  finalOpinion.value = draft;
}

async function onRepairPreChange() {
  await onSave({ repairPreReportId: repairPreReportId.value === '' ? null : Number(repairPreReportId.value) });
}

async function onImagesSave(images) {
  await onSave({ images });
}

async function saveOpinion() {
  await onSave({ finalOpinion: finalOpinion.value });
}

async function submit() {
  // 수리 확인 표시가 남아 있으면 안내만 한다 (막지 않음, 창 20)
  const warning = baselineForm.value?.getSubmitWarning?.();
  if (warning && !window.confirm(warning)) return;
  submitting.value = true;
  error.value = '';
  try {
    // 제출 전 최종 의견을 먼저 저장 (baseline은 항목·구역 확인·사진 입력도 함께 저장)
    // 수리 전·후는 문제 항목과 항목 사진도 함께 저장
    const pending = baselineForm.value
      ? baselineForm.value.getPayload()
      : isRepairType(inspection.value.type) && issueForm.value
        ? issueForm.value.getPayload()
        : {};
    await apiFetch(`/api/inspections/${route.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...pending, finalOpinion: finalOpinion.value }),
    });
    const data = await apiFetch(`/api/inspections/${route.params.id}/submit`, { method: 'POST' });
    submittedReportId.value = data.reportId;
    inspection.value = { ...inspection.value, status: 'reported' };
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <template v-if="inspection">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-xl font-bold tracking-tight">점검 작성</h2>
        <p class="text-[12.5px] text-ink-3">
          {{ labelForType(inspection.type) }} · {{ inspection.status }}
          <span v-if="savedAt" class="ml-2 text-ok">저장됨 <NumText :text="savedAt" /></span>
        </p>
      </div>

      <!-- 제출 완료 상태 -->
      <Banner v-if="inspection.status === 'reported'" tone="ok" class="gap-3">
        <p class="text-ink">
          점검이 제출되어 리포트가 생성되었습니다<span v-if="submittedReportId"> (#{{ submittedReportId }})</span>.
          생성 완료된 리포트는 수정/삭제할 수 없습니다.
        </p>
        <AppButton variant="ghost" sm class="self-start" @click="router.push('/contractor')">홈으로</AppButton>
      </Banner>

      <!-- 작성 중 -->
      <template v-else>
        <template v-if="inspection.flow === 'baseline'">
          <BaselineInspectionForm
            v-if="catalog"
            ref="baselineForm"
            :catalog="catalog"
            :initial-inspection="inspection"
            :carryover-enabled="canCarryOver(inspection)"
            :carryover-source="carryoverSource"
            :carryover-loading="carryoverLoading"
            :carryover-message="carryoverMessage"
            @save="onSave"
            @request-carryover="loadCarryover"
          />
        </template>
        <template v-else>
          <WholeInspectionForm v-if="inspection.flow === 'whole'" :initial-items="inspection.items" @save="onSave" />
          <template v-else>
            <!-- 수리 후 점검: 같은 호실의 수리 전 리포트 연결 (창 26) -->
            <AppCard v-if="inspection.type === 'repair_post'" class="gap-[5px]">
              <label for="repair-pre" class="text-xs font-medium text-ink-2">수리 전 리포트 선택</label>
              <select
                id="repair-pre"
                v-model="repairPreReportId"
                data-test="repair-pre-select"
                class="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink"
                @change="onRepairPreChange"
              >
                <option value="">연결 안 함</option>
                <option v-for="o in repairPreChoices" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
              <p v-if="!repairPreChoices.length" class="text-xs text-ink-3">이 호실에 수리 전 점검 리포트가 없습니다.</p>
            </AppCard>
            <IssueInspectionForm
              ref="issueForm"
              :initial-items="inspection.items"
              :initial-observations="inspection.observations"
              :photo-required="isRepairType(inspection.type)"
              :initial-images="inspection.images"
              @save="onSave"
            />
          </template>

          <!-- baseline·수리 전/후는 사진을 항목별로 폼 안에서 받는다(사진 PATCH는 전체 교체라 따로 두면 항목 사진이 지워진다) -->
          <PhotoUploader v-if="!isRepairType(inspection.type)" :initial-images="inspection.images" @save="onImagesSave" />
        </template>

        <AiGuidePanel
          :guide="aiGuide"
          :fallback="aiFallback"
          :loading="aiLoading"
          @request="requestGuide"
          @apply="applyDraft"
        />

        <AppCard class="gap-[5px]">
          <div class="flex items-center justify-between">
            <label for="final-opinion" class="text-xs font-medium text-ink-2">최종 의견</label>
            <button class="text-[13px] font-semibold text-accent" @click="saveOpinion">의견 저장</button>
          </div>
          <textarea
            id="final-opinion"
            v-model="finalOpinion"
            rows="4"
            placeholder="시공업자 최종 의견을 작성하세요. (리포트에는 이 의견만 표시됩니다)"
            class="w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          ></textarea>
        </AppCard>

        <AppButton :disabled="submitting" @click="submit">
          {{ submitting ? '제출 중…' : '점검 제출 (리포트 생성)' }}
        </AppButton>
      </template>
    </template>
  </section>
</template>
