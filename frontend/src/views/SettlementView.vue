<script setup>
// 보증금 공제 근거 (임대인). progress.md 창 8.
// 비교 화면의 query { moveInReportId, moveOutReportId }로 POST /api/settlements (같은 쌍이면 기존 정산이 온다).
// 부담자·견적을 바꿀 때마다 PATCH 응답의 settlement(백엔드 재계산 결과)로 화면을 바꾼다. 금액 계산은 백엔드가 한다.
// 창 11: 임차인 응답 링크 만들기(모의 알림 문구, 실제 발송 없음), 이의 → 보류 배너·이의 내용·"임대인 부담으로 돌리기", 합의 확정.
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { session } from '../stores/session.js';
import IntegrityBadge from '../components/IntegrityBadge.vue';
import AppCard from '../components/ui/AppCard.vue';
import NumText from '../components/ui/NumText.vue';
import AppButton from '../components/ui/AppButton.vue';
import Banner from '../components/ui/Banner.vue';
import Pill from '../components/ui/Pill.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import { stateBadge, evidenceBadge, tierLabel, formatDate } from '../lib/diffView.js';
import {
  PAYER_OPTIONS,
  SMALL_BULK_THRESHOLD,
  DISCLAIMERS,
  bulkSmallLabel,
  settlementRequest,
  itemAmountView,
  feeRow,
  manualNotice,
  totalsView,
  parseCostInput,
  bulkSmallResult,
  residualPercent,
  conditionClauseViews,
  conditionPatch,
} from '../lib/settlementView.js';
import {
  formatDateTime,
  responseBadge,
  statusBanner,
  confirmState,
  shareLinkStatus,
  shareUrl,
} from '../lib/settlementShareView.js';
import { evidenceButton } from '../lib/evidenceView.js';

const route = useRoute();

const settlement = ref(null);
const lease = ref(null); // 특약 요약용. 못 불러와도 화면은 보인다
const error = ref('');
const notice = ref('');
const loading = ref(true);
const busy = ref(false);
const costDrafts = reactive({}); // itemCode → 입력 중 문자열
const costErrors = reactive({});
const shareMessage = ref(''); // 방금 만든 링크의 모의 알림 문구
const copied = ref(false);
const verify = ref(null); // 확정 정산서 해시 검증 (창 15)

const isOwner = computed(() => session.role === 'owner');
const locked = computed(() => settlement.value?.status === 'confirmed');
const items = computed(() =>
  (settlement.value?.items ?? []).map((it) => ({
    ...it,
    view: itemAmountView(it, lease.value),
    conditions: conditionClauseViews(it), // 창 25
  }))
);
const fees = computed(() => (settlement.value?.fees ?? []).map(feeRow));
const manuals = computed(() => (settlement.value?.manualClauses ?? []).map(manualNotice));
const totals = computed(() => totalsView(settlement.value?.totals));
const banner = computed(() => statusBanner(settlement.value));
const confirmInfo = computed(() => confirmState(settlement.value));
const linkStatus = computed(() => shareLinkStatus(settlement.value?.shareLink));
const evidence = computed(() => (isOwner.value ? evidenceButton(settlement.value) : null)); // 창 19
const linkUrl = computed(() => shareUrl(settlement.value?.shareLink?.path, window.location.origin));

// 창 22: 부담자 SegmentedControl 옵션 (data-test payer-*는 그대로)
function payerOptions(it) {
  const disabled = busy.value || locked.value || !isOwner.value || !!it.tenantResponse;
  return PAYER_OPTIONS.map((o) => ({ ...o, disabled, test: `payer-${o.value}` }));
}

/** 적용 특약 원문 (정산이 쓰는 계약의 특약). 계약을 못 불러오면 ''. */
function clauseText(it) {
  if (it.basis?.type !== 'clause') return '';
  return lease.value?.clauses?.find((c) => c.clauseNo === it.basis.clauseNo)?.text ?? '';
}

// 창 22: "계산 근거" 바텀시트 (목업 formula). 화면에 있는 근거를 모아 보여 줄 뿐 새로 계산하지 않는다.
const sheetCode = ref('');
const sheetItem = computed(() => items.value.find((it) => it.itemCode === sheetCode.value) ?? null);
function closeSheet() {
  sheetCode.value = '';
}
function onKeydown(e) {
  if (e.key === 'Escape') closeSheet();
}
watch(sheetCode, (code) => {
  if (code) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/** 확정된 정산이면 해시 검증을 불러온다. 실패하면 뱃지만 빠진다. */
async function loadVerify(s) {
  verify.value =
    s.status === 'confirmed' ? await apiFetch(`/api/settlements/${s.id}/verify`).catch(() => null) : null;
}

function applySettlement(s, codes = null) {
  settlement.value = s;
  loadVerify(s);
  for (const it of s.items) {
    if (codes && !codes.includes(it.itemCode) && it.itemCode in costDrafts) continue;
    costDrafts[it.itemCode] = it.estimateCost == null ? '' : String(it.estimateCost);
    delete costErrors[it.itemCode];
  }
}

onMounted(async () => {
  const body = settlementRequest(route.query);
  if (!body) {
    error.value = '입주 전 리포트와 퇴거 리포트를 비교 화면에서 선택해 주세요.';
    loading.value = false;
    return;
  }
  try {
    const data = await apiFetch('/api/settlements', { method: 'POST', body: JSON.stringify(body) });
    applySettlement(data.settlement);
    // 정산이 쓰는 계약(leaseId) — 호실의 최근 계약이 아니다 (창 12)
    lease.value = await apiFetch(`/api/units/${data.settlement.unitId}/leases`)
      .then((d) => d.leases.find((l) => l.id === data.settlement.leaseId) ?? null)
      .catch(() => null);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function patchItem(itemCode, patch) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const data = await apiFetch(`/api/settlements/${settlement.value.id}/items/${encodeURIComponent(itemCode)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    applySettlement(data.settlement, [itemCode]);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function setPayer(item, payer) {
  if (item.payer !== payer) patchItem(item.itemCode, { payer });
}

function saveCost(item) {
  if (busy.value) return; // Enter 뒤 blur로 두 번 저장되지 않게
  const parsed = parseCostInput(costDrafts[item.itemCode]);
  if (!parsed.ok) {
    costErrors[item.itemCode] = parsed.error;
    return;
  }
  delete costErrors[item.itemCode];
  if (parsed.value === item.estimateCost) return;
  patchItem(item.itemCode, { estimateCost: parsed.value });
}

// 조건부 특약 "조건 해당" 체크 (창 25). 원인 판단은 임대인이 한다
function setCondition(item, clauseNo, checked) {
  patchItem(item.itemCode, conditionPatch(clauseNo, checked));
}

// 이의 항목 → 임대인 부담 (응답한 항목에 허용되는 유일한 수정)
function moveToLandlord(item) {
  patchItem(item.itemCode, { payer: 'landlord' });
}

async function postAction(path, onDone) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const data = await apiFetch(`/api/settlements/${settlement.value.id}/${path}`, { method: 'POST', body: '{}' });
    onDone(data);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function createShareLink() {
  postAction('share', (data) => {
    applySettlement(data.settlement);
    shareMessage.value = data.message;
    copied.value = false;
  });
}

function confirmSettlement() {
  postAction('confirm', (data) => {
    applySettlement(data.settlement);
    notice.value = '합의 확정되었습니다.';
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(linkUrl.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

async function bulkSmall() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const data = await apiFetch(`/api/settlements/${settlement.value.id}/bulk-small`, {
      method: 'POST',
      body: JSON.stringify({ threshold: SMALL_BULK_THRESHOLD }),
    });
    applySettlement(data.settlement, data.changedItemCodes);
    notice.value = bulkSmallResult(data.changedItemCodes, data.settlement.items);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xl font-bold tracking-tight">보증금 공제 근거</h2>
      <RouterLink to="/owner/compare" class="text-[13px] font-semibold text-accent">← 비교 화면</RouterLink>
    </div>

    <Banner v-if="!isOwner" tone="warn">보증금 공제 근거는 임대인만 만들고 수정할 수 있습니다.</Banner>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit" data-test="settlement-error">{{ error }}</p>

    <template v-if="settlement">
      <!-- 상단 요약 -->
      <AppCard as="header" class="gap-0.5">
        <b class="text-[13.5px]">
          입주 <span class="num">{{ formatDate(settlement.moveInDate) }}</span> → 퇴거 <span class="num">{{ formatDate(settlement.moveOutDate) }}</span>
        </b>
        <span class="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
          경과 {{ settlement.elapsedMonths }}개월 · 달라진 항목 {{ settlement.items.length }}개
          <Pill v-if="locked" tone="dark">확정됨</Pill>
        </span>
      </AppCard>

      <!-- 정산 상태 배너 (창 11) -->
      <div v-if="banner" class="flex flex-col gap-3.5" data-test="status-banner">
        <Banner :tone="banner.tone === 'hold' ? 'crit' : 'ok'">
          <b class="flex items-center gap-1.5">
            <svg
              v-if="banner.tone === 'hold'"
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
            {{ banner.title }}
          </b>
          <span class="text-[12.5px] text-ink-2">{{ banner.text }}</span>
        </Banner>
        <!-- 확정 정산서 무결성 (목업 sealbox) -->
        <IntegrityBadge v-if="banner.tone === 'confirmed'" :verify="verify" kind="settlement" />
      </div>

      <!-- 분쟁 대비 증빙 자료 (창 19). 보류면 강조 -->
      <AppCard
        v-if="evidence"
        :class="['flex-row flex-wrap items-center gap-3', evidence.emphasized ? 'border-2 border-crit' : '']"
        data-test="evidence-link"
        :data-emphasized="evidence.emphasized"
      >
        <RouterLink
          :to="evidence.to"
          :class="[
            'inline-flex items-center justify-center gap-1.5 rounded-[9px] px-[11px] py-[7px] text-[12.5px] font-semibold hover:brightness-105',
            evidence.emphasized ? 'bg-crit text-white' : 'border border-line bg-surface text-ink',
          ]"
        >
          📁 {{ evidence.label }}
        </RouterLink>
        <p class="min-w-40 flex-1 text-xs text-ink-2">{{ evidence.hint }}</p>
      </AppCard>

      <!-- 소액 일괄 -->
      <div class="flex flex-col gap-1.5">
        <AppButton variant="ghost" :disabled="busy || locked || !isOwner" data-test="bulk-small" @click="bulkSmall">
          {{ bulkSmallLabel(SMALL_BULK_THRESHOLD) }}
        </AppButton>
        <p v-if="notice" class="text-[12.5px] text-ok" data-test="bulk-notice">{{ notice }}</p>
      </div>

      <!-- 항목 카드 -->
      <p v-if="items.length === 0" class="rounded-btn bg-ok-soft px-3.5 py-3 text-[13px] text-ok">
        입주 때보다 나빠진 항목이 없습니다.
      </p>
      <AppCard v-for="it in items" :key="it.itemCode" as="article" data-test="settlement-item">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="text-[12.5px] text-ink-3">{{ it.zone }}</span>
            <h3 class="text-[15px] font-semibold">{{ it.name }}</h3>
            <Pill :tone="it.tier === 'core' ? 'dark' : 'plain'">{{ tierLabel(it.tier) }}</Pill>
          </span>
          <Pill :tone="evidenceBadge(it.evidence).tone">{{ evidenceBadge(it.evidence).label }}</Pill>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <Pill :tone="stateBadge(it.from).tone">입주 {{ stateBadge(it.from).label }}</Pill>
          <span class="text-[12.5px] text-ink-3">→</span>
          <Pill :tone="stateBadge(it.to).tone">퇴거 {{ stateBadge(it.to).label }}</Pill>
        </div>

        <!-- 부담자 -->
        <SegmentedControl
          :options="payerOptions(it)"
          :model-value="it.payer"
          aria-label="부담자"
          @update:model-value="(v) => setPayer(it, v)"
        />

        <!-- 견적 -->
        <div class="flex flex-wrap items-center gap-2">
          <label :for="`cost-${it.itemCode}`" class="text-[12.5px] text-ink-2">견적 금액</label>
          <input
            :id="`cost-${it.itemCode}`"
            v-model="costDrafts[it.itemCode]"
            inputmode="numeric"
            placeholder="예: 150000"
            class="num w-[130px] rounded-[10px] border border-line bg-surface px-3 py-2 text-right text-sm text-ink disabled:bg-surface-2 disabled:text-ink-3"
            :disabled="busy || locked || !isOwner || !!it.tenantResponse"
            data-test="cost-input"
            @keydown.enter="saveCost(it)"
            @blur="saveCost(it)"
          />
          <span class="text-[12.5px] text-ink-2">원</span>
          <p v-if="costErrors[it.itemCode]" class="w-full text-xs text-crit">{{ costErrors[it.itemCode] }}</p>
        </div>

        <!-- 금액·적용 기준 -->
        <div class="flex flex-col gap-1 rounded-btn bg-surface-2 p-3" data-test="item-amount">
          <b v-if="it.payer === 'tenant'" class="num text-base">{{ it.view.amountText }}</b>
          <b v-else class="text-[12.5px] text-ink-2">{{ it.view.amountText }}</b>
          <template v-if="it.view.basisText">
            <span v-if="it.basis?.type === 'clause'" class="text-[12.5px] text-ink-2">{{ it.view.basisText }}</span>
            <span v-else class="text-[12.5px] text-ink-2"><NumText :text="it.view.basisText" /></span>
          </template>
          <span
            v-if="it.payer === 'tenant' && clauseText(it)"
            class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2"
          >“{{ clauseText(it) }}”</span>
          <span v-if="it.view.referenceText" class="text-xs text-ink-3"><NumText :text="it.view.referenceText" /></span>
          <span v-if="it.view.noteText" class="text-xs text-warn">{{ it.view.noteText }}</span>
        </div>

        <!-- 조건부 특약 (창 25): 해당 가능 안내 + 임대인 확인 체크. full_cost 특약이 먼저면 안내만 -->
        <div
          v-for="c in it.conditions"
          :key="c.key"
          :class="['flex flex-col gap-1.5 rounded-btn p-3', c.blocked ? 'border border-line' : 'bg-warn-soft']"
          data-test="condition-clause"
        >
          <span :class="['text-[12.5px] font-semibold', c.blocked ? 'text-ink-2' : 'text-warn']" data-test="condition-notice">
            {{ c.noticeText }}
          </span>
          <label
            :class="['flex items-center gap-2 text-[12.5px]', c.blocked ? 'text-ink-3' : 'text-ink']"
          >
            <input
              type="checkbox"
              class="size-4 accent-accent"
              :checked="c.checked"
              :disabled="c.blocked || busy || locked || !isOwner || !!it.tenantResponse"
              data-test="condition-check"
              @change="(e) => setCondition(it, c.clauseNo, e.target.checked)"
            />
            {{ c.checkboxLabel }}
          </label>
        </div>

        <!-- 임차인 응답 (창 11). 응답한 항목은 "임대인 부담으로 돌리기"만 가능 -->
        <div
          v-if="it.tenantResponse"
          :class="[
            'flex flex-col gap-1.5 rounded-btn p-3',
            it.tenantResponse === 'object' && it.payer === 'tenant' ? 'bg-crit-soft' : 'border border-line',
          ]"
          data-test="tenant-response"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Pill :tone="responseBadge(it.tenantResponse).tone">{{ responseBadge(it.tenantResponse).label }}</Pill>
            <span class="num text-xs text-ink-3">{{ formatDateTime(it.tenantRespondedAt) }}</span>
          </div>
          <p
            v-if="it.tenantResponseText"
            class="whitespace-pre-line border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2"
          >{{ it.tenantResponseText }}</p>
          <img
            v-if="it.tenantResponseImage"
            :src="it.tenantResponseImage"
            alt="이의 사진"
            class="max-h-48 self-start rounded-[10px] border border-line"
          />
          <AppButton
            v-if="it.tenantResponse === 'object' && it.payer === 'tenant'"
            variant="seal"
            sm
            class="self-start"
            :disabled="busy || locked || !isOwner"
            data-test="move-to-landlord"
            @click="moveToLandlord(it)"
          >
            임대인 부담으로 돌리기
          </AppButton>
          <p v-else class="text-xs text-ink-3">임차인이 응답한 항목은 부담자·견적을 바꿀 수 없습니다.</p>
        </div>
        <Pill v-else-if="it.payer === 'tenant' && settlement.shareLink" tone="plain" class="self-start">
          {{ responseBadge(null).label }}
        </Pill>

        <button
          v-if="it.basis && it.payer === 'tenant'"
          type="button"
          class="self-start text-left text-[13px] font-semibold text-accent"
          data-test="open-basis"
          @click="sheetCode = it.itemCode"
        >
          계산 근거 보기 ›
        </button>
      </AppCard>

      <!-- 고정 금액 특약 (청소비 등) -->
      <AppCard v-for="f in fees" :key="f.key" as="article" class="gap-1" data-test="fee-row">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <b>{{ f.title }}</b>
          <b class="num">{{ f.amountText }}</b>
        </div>
        <span class="text-[12.5px] text-ink-2">임차인 부담 · {{ f.basisText }}</span>
        <span class="text-[12.5px] text-ink-3">{{ f.text }}</span>
      </AppCard>

      <!-- 수동 확인 필요 특약 -->
      <Banner v-for="m in manuals" :key="m.key" tone="warn" data-test="manual-clause">
        <b>{{ m.title }}</b>
        <span class="text-[12.5px] text-ink-2">{{ m.text }}</span>
        <span class="text-xs text-ink-3">자동 계산에 반영하지 않았습니다. 해당 항목이 있으면 직접 확인해 주세요.</span>
      </Banner>

      <!-- 합계 -->
      <AppCard as="section" data-test="totals">
        <dl class="flex flex-col gap-2.5">
          <div v-for="r in totals.rows" :key="r.key" class="flex items-baseline justify-between gap-2.5">
            <dt class="text-[12.5px] text-ink-2">
              {{ r.label }}
              <span v-if="r.sub" class="block text-xs text-ink-3">{{ r.sub }}</span>
            </dt>
            <dd
              :class="[
                'shrink-0 text-right',
                r.key === 'tenant' ? 'text-[19px] font-semibold' : r.key === 'return' ? 'text-base font-semibold' : '',
              ]"
            >
              <NumText :text="r.value" />
            </dd>
          </div>
        </dl>
        <p v-if="totals.holdText" class="text-xs text-ink-3">{{ totals.holdText }}</p>
      </AppCard>

      <!-- 임차인 응답 링크 (창 11). 실제 발송 없음 -->
      <AppCard as="section" data-test="share-section">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-bold">임차인 확인 링크</h3>
          <AppButton variant="ghost" sm :disabled="busy || locked || !isOwner" data-test="create-share" @click="createShareLink">
            {{ settlement.shareLink ? '새 링크 만들기' : '임차인 응답 링크 만들기' }}
          </AppButton>
        </div>
        <p class="text-xs text-ink-3">
          임차인은 설치·로그인 없이 링크로 임차인 부담 항목마다 동의 또는 이의를 남깁니다. 7일 뒤 만료됩니다.
        </p>
        <template v-if="settlement.shareLink">
          <div class="flex items-center gap-2">
            <code class="num min-w-0 flex-1 break-all rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-2" data-test="share-url">{{ linkUrl }}</code>
            <AppButton variant="ghost" sm class="shrink-0" @click="copyLink">{{ copied ? '복사됨' : '복사' }}</AppButton>
          </div>
          <p class="text-xs text-ink-2">{{ linkStatus.expiryText }} · {{ linkStatus.viewText }}</p>
        </template>
        <Banner v-if="shareMessage" tone="warn" data-test="share-message">
          <b class="text-xs">알림 문구 (모의 · 실제로 발송하지 않습니다)</b>
          <span class="whitespace-pre-line text-[12.5px] text-ink-2">{{ shareMessage }}</span>
        </Banner>
      </AppCard>

      <!-- 합의 확정 (창 11) -->
      <AppCard v-if="!locked" as="section">
        <AppButton :disabled="busy || !isOwner || !confirmInfo.enabled" data-test="confirm-settlement" @click="confirmSettlement">
          합의 확정
        </AppButton>
        <p :class="['text-[12.5px]', confirmInfo.enabled ? 'text-ok' : 'text-ink-2']" data-test="confirm-reason">
          {{ confirmInfo.reason }}
        </p>
      </AppCard>

      <!-- 고지 문구 -->
      <div class="flex flex-col gap-0.5 text-xs text-ink-3" data-test="disclaimers">
        <p v-for="d in DISCLAIMERS" :key="d">※ {{ d }}</p>
      </div>
    </template>

    <!-- 계산 근거 바텀시트 (창 22, 목업 formula) — 카드에 있는 근거를 모아 보여 줄 뿐 새로 계산하지 않는다 -->
    <Teleport to="body">
      <div
        v-if="sheetItem"
        class="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(12,18,16,.42)]"
        data-test="basis-sheet"
        @click.self="closeSheet"
      >
        <div
          class="flex max-h-[84vh] w-full max-w-[430px] flex-col gap-3 overflow-auto rounded-t-[20px] bg-surface px-4 pt-2.5 pb-6"
          role="dialog"
          aria-modal="true"
          :aria-label="`${sheetItem.zone} ${sheetItem.name} 계산 근거`"
        >
          <span class="h-1 w-10 self-center rounded-chip bg-line" aria-hidden="true"></span>
          <h3 class="text-[17px] font-bold tracking-tight">{{ sheetItem.zone }} {{ sheetItem.name }} · 계산 근거</h3>
          <div class="flex flex-wrap items-center gap-1.5">
            <Pill :tone="evidenceBadge(sheetItem.evidence).tone">{{ evidenceBadge(sheetItem.evidence).label }}</Pill>
            <Pill :tone="stateBadge(sheetItem.from).tone">입주 {{ stateBadge(sheetItem.from).label }}</Pill>
            <span class="text-[12.5px] text-ink-3">→</span>
            <Pill :tone="stateBadge(sheetItem.to).tone">퇴거 {{ stateBadge(sheetItem.to).label }}</Pill>
          </div>

          <AppCard :class="['gap-1.5', sheetItem.basis?.type === 'clause' ? 'border-accent' : '']">
            <span v-if="sheetItem.view.basisText" class="text-[12.5px] text-ink-2">{{ sheetItem.view.basisText }}</span>
            <span
              v-if="clauseText(sheetItem)"
              class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2"
            >“{{ clauseText(sheetItem) }}”</span>
            <b><NumText :text="sheetItem.view.amountText" /></b>
          </AppCard>

          <pre
            class="m-0 whitespace-pre-wrap break-all rounded-[10px] bg-surface-2 px-3 py-2.5 font-sans text-[12.5px] leading-[1.7]"
          >잔존가치 = <span class="num">1</span> − 경과 월수 ÷ (내구연수 × <span class="num">12</span>)
경과 <span class="num">{{ settlement.elapsedMonths }}</span>개월<template v-if="sheetItem.lifespanYears"> · 내구연수 <span class="num">{{ sheetItem.lifespanYears }}</span>년</template> · 잔존 <span class="num">{{ residualPercent(sheetItem.basis?.residual) }}</span><template v-if="sheetItem.view.referenceText">
<NumText :text="sheetItem.view.referenceText" /></template></pre>

          <div class="flex flex-col gap-0.5 text-xs text-ink-3">
            <p v-for="d in DISCLAIMERS" :key="d">※ {{ d }}</p>
          </div>
          <AppButton variant="ghost" @click="closeSheet">닫기</AppButton>
        </div>
      </div>
    </Teleport>
  </section>
</template>
