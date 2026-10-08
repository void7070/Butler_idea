<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { session } from '../stores/session.js';
import ReportSnapshotView from '../components/ReportSnapshotView.vue';
import IntegrityBadge from '../components/IntegrityBadge.vue';
import TenantBaselineActions from '../components/TenantBaselineActions.vue';
import AppButton from '../components/ui/AppButton.vue';

const route = useRoute();
const router = useRouter();
const snapshot = ref(null);
const error = ref('');
const loading = ref(true);
const confirmed = ref(false);
const shareUrl = ref('');
const busy = ref(false);
const verify = ref(null);

const reportId = computed(() => route.params.id);
const basePath = computed(() => (session.role === 'owner' ? '/owner/reports' : '/tenant/reports'));
// 입주 전 리포트: 임차인은 이상 제보·구역 확인, 임대인은 입주 제보 승인 (창 10)
const isMoveIn = computed(() => snapshot.value?.inspection?.type === 'move_in');

async function load() {
  try {
    snapshot.value = (await apiFetch(`/api/reports/${reportId.value}`)).report;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
  // 해시 검증 뱃지 (창 9). 실패해도 리포트는 그대로 보인다(뱃지만 빠짐)
  try {
    verify.value = await apiFetch(`/api/reports/${reportId.value}/verify`);
  } catch {
    verify.value = null;
  }
}

async function confirm() {
  busy.value = true;
  error.value = '';
  try {
    await apiFetch(`/api/reports/${reportId.value}/confirm`, { method: 'POST' });
    confirmed.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function share() {
  busy.value = true;
  error.value = '';
  try {
    const data = await apiFetch(`/api/reports/${reportId.value}/share`, { method: 'POST' });
    shareUrl.value = `${window.location.origin}${data.path}`;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function printReport() {
  router.push(`/reports/${reportId.value}/print`);
}

onMounted(load);
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <RouterLink :to="basePath" class="self-start text-[13px] font-semibold text-accent">← 목록으로</RouterLink>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <template v-if="snapshot">
      <!-- 액션 (인쇄 시 숨김 — F08 print 스타일과 연동). 수정·삭제 버튼은 없다 -->
      <div class="flex flex-wrap gap-1.5 print:hidden">
        <AppButton variant="ghost" sm :disabled="busy || confirmed" @click="confirm">
          {{ confirmed ? '확인 완료됨' : '확인 완료' }}
        </AppButton>
        <AppButton variant="ghost" sm :disabled="busy" @click="share">공유 링크 생성</AppButton>
        <AppButton variant="ghost" sm @click="printReport">PDF 저장 (인쇄)</AppButton>
        <AppButton
          v-if="isMoveIn && session.role === 'owner'"
          :as="RouterLink"
          :to="`/owner/reports/${reportId}/tenant-reports`"
          variant="seal"
          sm
        >
          입주 제보 승인
        </AppButton>
      </div>

      <p v-if="shareUrl" class="break-all rounded-[10px] bg-surface px-3 py-2 text-xs text-ink-2 print:hidden">
        공유 링크: <a :href="shareUrl" class="num font-semibold text-accent underline">{{ shareUrl }}</a>
      </p>

      <!-- 무결성 (목업 sealbox) -->
      <IntegrityBadge :verify="verify" />

      <TenantBaselineActions v-if="isMoveIn && session.role === 'tenant'" :report-id="reportId" />

      <ReportSnapshotView :snapshot="snapshot" />
    </template>
  </section>
</template>
