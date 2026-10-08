<script setup>
// 공유 링크 리포트 (비인증). 7일 뒤 만료(백엔드 410, 창 11). 참여자 이름은 서버가 가려서 보낸다(창 27).
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import ReportSnapshotView from '../components/ReportSnapshotView.vue';
import IntegrityBadge from '../components/IntegrityBadge.vue';
import AppButton from '../components/ui/AppButton.vue';

const route = useRoute();
const snapshot = ref(null);
const error = ref('');
const loading = ref(true);
const verify = ref(null);

onMounted(async () => {
  try {
    const data = await apiFetch(`/api/share/${route.params.token}`);
    snapshot.value = data.report;
    verify.value = data.verify ?? null; // 해시 검증 뱃지 (창 9)
  } catch (e) {
    error.value = e.message || '유효하지 않거나 만료된 공유 링크입니다.';
  } finally {
    loading.value = false;
  }
});

function printReport() {
  window.print();
}
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <template v-if="snapshot">
      <div class="flex items-center justify-between gap-2 print:hidden">
        <p class="text-[12.5px] text-ink-3">공유된 리포트</p>
        <AppButton variant="ghost" sm @click="printReport">PDF 저장 (인쇄)</AppButton>
      </div>
      <p class="text-xs text-ink-3" data-test="name-mask-note">개인정보 보호를 위해 이름 일부를 가렸습니다</p>
      <IntegrityBadge :verify="verify" />
      <ReportSnapshotView :snapshot="snapshot" />
    </template>
  </section>
</template>
