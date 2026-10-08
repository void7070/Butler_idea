<script setup>
// 임차인 정산 링크 (비인증, 창 11). 설치·로그인 없이 링크로 임차인 부담 항목마다 동의/이의를 한 번 남긴다.
// 응답은 수정·삭제할 수 없다(백엔드도 400). 7일 뒤 만료되면 백엔드가 410.
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import IntegrityBadge from '../components/IntegrityBadge.vue';
import AppCard from '../components/ui/AppCard.vue';
import NumText from '../components/ui/NumText.vue';
import AppButton from '../components/ui/AppButton.vue';
import Banner from '../components/ui/Banner.vue';
import Pill from '../components/ui/Pill.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import { stateBadge, evidenceBadge, formatDate } from '../lib/diffView.js';
import { formatWon, feeRow, DISCLAIMERS } from '../lib/settlementView.js';
import { isWithinSize, fileToDataUrl } from '../lib/image.js';
import {
  RESPONSE_OPTIONS,
  formatDateTime,
  responseBadge,
  shareBasisView,
  responseFormError,
  responsePayload,
  responseProgress,
} from '../lib/settlementShareView.js';

const route = useRoute();
const token = route.params.token;

const settlement = ref(null);
const link = ref(null);
const verify = ref(null); // 확정 정산서 해시 검증 (창 15), 확정 전이면 null
const error = ref('');
const loading = ref(true);
const busyItem = ref('');
const drafts = reactive({}); // itemCode → { response, text, image }
const formErrors = reactive({});

const items = computed(() => (settlement.value?.items ?? []).map((it) => ({ ...it, basisView: shareBasisView(it) })));
const fees = computed(() => (settlement.value?.fees ?? []).map(feeRow));
const progress = computed(() => responseProgress(settlement.value?.items));
const confirmed = computed(() => settlement.value?.status === 'confirmed');
// 창 22: 동의/이의 SegmentedControl (data-test choose-*는 그대로)
const responseOptions = RESPONSE_OPTIONS.map((o) => ({ ...o, test: `choose-${o.value}` }));
// 주소창 느낌 상단: 토큰은 앞 8자만
const urlText = `${window.location.host}/share/settlement/${String(token).slice(0, 8)}…`;

function draftOf(code) {
  if (!drafts[code]) drafts[code] = { response: '', text: '', image: null };
  return drafts[code];
}

onMounted(async () => {
  try {
    const data = await apiFetch(`/api/share/settlement/${token}`);
    settlement.value = data.settlement;
    link.value = data.link;
    verify.value = data.verify ?? null;
  } catch (e) {
    error.value = e.message || '유효하지 않거나 만료된 링크입니다.';
  } finally {
    loading.value = false;
  }
});

async function onPhoto(code, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!isWithinSize(file)) {
    formErrors[code] = '사진은 10MB 이하만 올릴 수 있습니다.';
    event.target.value = '';
    return;
  }
  draftOf(code).image = await fileToDataUrl(file);
  delete formErrors[code];
}

async function submit(code) {
  const draft = draftOf(code);
  const msg = responseFormError(draft);
  if (msg) {
    formErrors[code] = msg;
    return;
  }
  delete formErrors[code];
  busyItem.value = code;
  try {
    const data = await apiFetch(`/api/share/settlement/${token}/respond`, {
      method: 'POST',
      body: JSON.stringify(responsePayload(code, draft)),
    });
    settlement.value = data.settlement;
  } catch (e) {
    formErrors[code] = e.message;
  } finally {
    busyItem.value = '';
  }
}
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <!-- 모바일 브라우저 주소창 느낌 (목업 t-settle urlbar) -->
    <header class="-mx-4 -mt-4 flex flex-col gap-2 border-b border-line bg-surface px-3 pt-2 pb-2.5" data-test="urlbar">
      <div class="num flex items-center justify-center gap-1.5 rounded-[10px] bg-surface-2 px-2.5 py-[7px] text-xs text-ink-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span class="min-w-0 truncate">{{ urlText }}</span>
      </div>
      <div class="flex items-center justify-between text-xs text-ink-2">
        <span>로그인 없이 링크로 열람 중</span>
        <Pill tone="warn">임차인</Pill>
      </div>
    </header>

    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit" data-test="share-error">{{ error }}</p>

    <template v-if="settlement">
      <AppCard as="header" class="gap-[3px]">
        <span class="text-[12.5px] text-ink-3">보증금 정산서 · 임차인 확인</span>
        <h2 class="text-[15px] font-semibold">{{ settlement.unitName }} 퇴거 정산</h2>
        <span class="text-[12.5px] text-ink-2">
          입주 <span class="num">{{ formatDate(settlement.moveInDate) }}</span> → 퇴거 <span class="num">{{ formatDate(settlement.moveOutDate) }}</span> · 경과
          <span class="num">{{ settlement.elapsedMonths }}</span>개월
        </span>
        <span class="text-[12.5px] text-ink-3">
          링크 유효 <span class="num">{{ formatDateTime(link?.expiresAt) }}</span>까지 · 최초 열람 <span class="num">{{ formatDateTime(link?.firstViewedAt) }}</span>
        </span>
        <span class="text-xs text-ink-3" data-test="name-mask-note">개인정보 보호를 위해 이름 일부를 가렸습니다</span>
      </AppCard>

      <Banner tone="plain" data-test="response-guide">
        <span class="text-[12.5px] text-ink-2">임차인 부담으로 청구된 항목입니다. 항목마다 <b>동의</b> 또는 <b>이의</b>를 한 번 남겨 주세요.</span>
        <span class="text-xs text-ink-3">
          남긴 응답은 시각과 함께 기록되며 <b>수정·삭제 기능이 없습니다.</b> 이의가 하나라도 있으면 정산이 보류됩니다.
        </span>
      </Banner>

      <!-- 확정 배너 + 무결성 박스 (목업 sealbox) -->
      <div v-if="confirmed" class="flex flex-col gap-3.5" data-test="confirmed-notice">
        <Banner tone="ok">
          <b>합의 확정된 정산입니다 ({{ formatDateTime(settlement.confirmedAt) }}). 더 이상 응답할 수 없습니다.</b>
        </Banner>
        <IntegrityBadge :verify="verify" kind="settlement" />
      </div>
      <Banner v-else-if="settlement.status === 'hold'" tone="crit" data-test="hold-notice">
        <b>이의가 접수되어 정산이 보류 중입니다. 임대인이 확인합니다.</b>
      </Banner>

      <p class="text-[12.5px] text-ink-2" data-test="progress">
        청구 항목 {{ progress.total }}개 · 동의 {{ progress.agreed }} · 이의 {{ progress.objected }} · 대기 {{ progress.waiting }}
      </p>

      <p v-if="items.length === 0" class="rounded-btn bg-ok-soft px-3.5 py-3 text-[13px] text-ok">
        임차인 부담으로 청구된 항목이 없습니다.
      </p>

      <AppCard v-for="it in items" :key="it.itemCode" as="article" data-test="share-item">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="text-[12.5px] text-ink-3">{{ it.zone }}</span>
            <h3 class="text-[15px] font-semibold">{{ it.name }}</h3>
          </span>
          <Pill :tone="evidenceBadge(it.evidence).tone">{{ evidenceBadge(it.evidence).label }}</Pill>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <Pill :tone="stateBadge(it.from).tone">입주 {{ stateBadge(it.from).label }}</Pill>
          <span class="text-[12.5px] text-ink-3">→</span>
          <Pill :tone="stateBadge(it.to).tone">퇴거 {{ stateBadge(it.to).label }}</Pill>
        </div>

        <div class="flex flex-col gap-1 rounded-btn bg-surface-2 p-3">
          <b class="num text-base">{{ formatWon(it.tenantAmount) }}</b>
          <span class="text-[12.5px] text-ink-2"
            ><template v-if="it.basis?.type === 'clause'">{{ it.basisView.basisText }}</template
            ><NumText v-else :text="it.basisView.basisText"
          /></span>
          <span
            v-if="it.basisView.clauseText"
            class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2"
            data-test="clause-text"
          >“{{ it.basisView.clauseText }}”</span>
          <span v-if="it.basisView.referenceText" class="text-xs text-ink-3"><NumText :text="it.basisView.referenceText" /></span>
        </div>

        <!-- 응답 기록 (수정·삭제 없음) -->
        <div v-if="it.response" class="flex flex-col gap-1.5" data-test="response-record">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Pill :tone="responseBadge(it.response.response).tone">{{ responseBadge(it.response.response).label }}</Pill>
            <span class="text-xs text-ink-3"><span class="num">{{ formatDateTime(it.response.respondedAt) }}</span> 기록 · 수정 불가</span>
          </div>
          <p
            v-if="it.response.text"
            class="whitespace-pre-line border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2"
          >{{ it.response.text }}</p>
          <img
            v-if="it.response.image"
            :src="it.response.image"
            alt="이의 사진"
            class="max-h-48 self-start rounded-[10px] border border-line"
          />
        </div>

        <!-- 응답 입력 -->
        <div v-else-if="!confirmed" class="flex flex-col gap-2" data-test="response-form">
          <SegmentedControl
            :options="responseOptions"
            :model-value="draftOf(it.itemCode).response"
            aria-label="응답"
            @update:model-value="(v) => (draftOf(it.itemCode).response = v)"
          />
          <template v-if="draftOf(it.itemCode).response === 'object'">
            <textarea
              v-model="draftOf(it.itemCode).text"
              rows="3"
              placeholder="이의 내용 (예: 입주 때부터 있던 얼룩입니다)"
              class="min-h-[72px] w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm leading-normal text-ink"
              data-test="object-text"
            ></textarea>
            <label class="flex flex-col gap-1 text-xs font-medium text-ink-2">
              사진 (선택, 10MB 이하 1장)
              <input type="file" accept="image/*" class="block text-xs text-ink-2" @change="onPhoto(it.itemCode, $event)" />
            </label>
            <img
              v-if="draftOf(it.itemCode).image"
              :src="draftOf(it.itemCode).image"
              alt="첨부 사진"
              class="max-h-32 self-start rounded-[10px] border border-line"
            />
          </template>
          <p v-if="formErrors[it.itemCode]" class="text-xs text-crit">{{ formErrors[it.itemCode] }}</p>
          <AppButton
            :disabled="!!busyItem || !draftOf(it.itemCode).response"
            data-test="submit-response"
            @click="submit(it.itemCode)"
          >
            응답 남기기
          </AppButton>
          <p class="text-xs text-ink-3">한 번 남기면 수정·삭제할 수 없습니다.</p>
        </div>
      </AppCard>

      <AppCard v-for="f in fees" :key="f.key" as="article" class="gap-1" data-test="fee-row">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <b>{{ f.title }}</b>
          <b class="num">{{ f.amountText }}</b>
        </div>
        <span class="text-[12.5px] text-ink-2">{{ f.basisText }}</span>
        <span class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2">“{{ f.text }}”</span>
      </AppCard>

      <AppCard as="section" class="gap-2">
        <div class="flex items-baseline justify-between gap-2.5">
          <span class="text-[12.5px] text-ink-2">임차인 청구 합계</span>
          <b class="num">{{ formatWon(settlement.totals.tenantTotal) }}</b>
        </div>
        <div v-if="settlement.totals.depositReturn != null" class="flex items-baseline justify-between gap-2.5">
          <span class="text-[12.5px] text-ink-2">보증금 반환 예정</span>
          <b class="num text-[19px]">{{ formatWon(settlement.totals.depositReturn) }}</b>
        </div>
      </AppCard>

      <div class="flex flex-col gap-0.5 text-xs text-ink-3">
        <p v-for="d in DISCLAIMERS" :key="d">※ {{ d }}</p>
      </div>
    </template>
  </section>
</template>
