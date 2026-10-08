<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { apiFetch, apiDownload } from '../lib/api.js';
import { formatWon } from '../lib/settlementView.js';
import AppCard from '../components/ui/AppCard.vue';
import AppButton from '../components/ui/AppButton.vue';
import Banner from '../components/ui/Banner.vue';
import {
  TAX_NOTICE,
  PENDING_NOTICE,
  reasonClass,
  ledgerQuery,
  csvFilename,
  pendingStatusLabel,
  filterLabel,
  hasTampered,
} from '../lib/repairLedgerView.js';

// 수선비 장부 (창 16). 확정 정산서의 임대인 부담 항목 + 확정 전 "예정". 계산은 백엔드, 여기서는 표시·필터·CSV 내려받기만.
const filter = reactive({ year: '', unitId: '' });
const data = ref(null);
const years = ref([]);
const units = ref([]);
const error = ref('');
const downloadError = ref('');
const loading = ref(true);
const downloading = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await apiFetch(`/api/owner/repair-ledger${ledgerQuery(filter)}`);
    data.value = d;
    years.value = d.years;
    units.value = d.units;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function downloadCsv() {
  downloading.value = true;
  downloadError.value = '';
  try {
    await apiDownload(`/api/owner/repair-ledger.csv${ledgerQuery(filter)}`, csvFilename(filter, units.value));
  } catch (e) {
    downloadError.value = e.message;
  } finally {
    downloading.value = false;
  }
}

watch(filter, load);
onMounted(load);
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-xl font-bold tracking-tight">수선비 장부</h2>
      <p class="text-[13px] text-ink-2">합의 확정된 정산서의 임대인 부담 항목을 모았습니다.</p>
    </div>
    <AppButton variant="ghost" :disabled="downloading || loading" data-test="csv-download" @click="downloadCsv">
      {{ downloading ? '내려받는 중…' : 'CSV 내려받기' }}
    </AppButton>

    <Banner tone="warn" data-test="tax-notice">
      <span class="text-[12.5px] text-ink-2">{{ TAX_NOTICE }}. 이 화면은 금액을 모아 보여 줄 뿐 세금을 계산하지 않습니다.</span>
    </Banner>
    <p v-if="downloadError" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ downloadError }}</p>

    <div class="grid grid-cols-2 gap-2.5">
      <label class="flex flex-col gap-1 text-xs font-medium text-ink-2">
        연도
        <select
          v-model="filter.year"
          class="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] text-ink"
          data-test="year-filter"
        >
          <option value="">전체</option>
          <option v-for="y in years" :key="y" :value="y">{{ y }}년</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-ink-2">
        호실
        <select
          v-model="filter.unitId"
          class="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] text-ink"
          data-test="unit-filter"
        >
          <option value="">전체</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </label>
    </div>

    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
    <p v-if="loading && !data" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <template v-if="data && !error">
      <Banner v-if="hasTampered(data.rows)" tone="crit" data-test="tampered">
        <b>변경 감지 · 기록된 해시와 다른 정산서가 있습니다. 해당 행을 확인하세요.</b>
      </Banner>

      <div class="flex flex-col gap-2">
        <h3 class="font-bold">
          확정 항목 <span class="text-[12.5px] font-normal text-ink-3">{{ filterLabel(filter, units) }}</span>
        </h3>
        <AppCard v-if="!data.rows.length" class="text-[12.5px] text-ink-3" data-test="empty">
          합의 확정된 임대인 부담 항목이 없습니다.
        </AppCard>
        <AppCard v-else class="overflow-x-auto p-2">
          <table class="w-full border-collapse text-xs" data-test="ledger-table">
            <thead class="text-left text-ink-3">
              <tr>
                <th class="border-b border-line px-1.5 py-[7px] font-medium whitespace-nowrap">확정일</th>
                <th class="border-b border-line px-1.5 py-[7px] font-medium whitespace-nowrap">호실</th>
                <th class="border-b border-line px-1.5 py-[7px] font-medium whitespace-nowrap">구역 · 항목</th>
                <th class="border-b border-line px-1.5 py-[7px] text-right font-medium whitespace-nowrap">금액</th>
                <th class="border-b border-line px-1.5 py-[7px] font-medium whitespace-nowrap">사유</th>
                <th class="border-b border-line px-1.5 py-[7px] font-medium whitespace-nowrap">정산</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in data.rows"
                :key="`${r.settlementId}-${r.itemCode}`"
                :class="r.hashOk === false ? 'bg-crit-soft' : ''"
                data-test="ledger-row"
              >
                <td class="num border-b border-line px-1.5 py-[7px] whitespace-nowrap">{{ r.date }}</td>
                <td class="border-b border-line px-1.5 py-[7px] whitespace-nowrap">{{ r.unitName }}</td>
                <td class="border-b border-line px-1.5 py-[7px] whitespace-nowrap">
                  <span class="text-ink-3">{{ r.zone }}</span> · {{ r.itemName }}
                  <span v-if="r.hashOk === false" class="ml-1 font-semibold text-crit">변경 감지</span>
                </td>
                <td class="num border-b border-line px-1.5 py-[7px] text-right whitespace-nowrap">{{ formatWon(r.amount) }}</td>
                <td class="border-b border-line px-1.5 py-[7px] whitespace-nowrap">
                  <span class="rounded-chip px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap" :class="reasonClass(r.reason)">
                    {{ r.reason }}
                  </span>
                </td>
                <td class="num border-b border-line px-1.5 py-[7px] whitespace-nowrap text-ink-3">#{{ r.settlementId }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td class="px-1.5 py-[7px]" colspan="3">합계</td>
                <td class="num px-1.5 py-[7px] text-right whitespace-nowrap" data-test="ledger-total">
                  {{ formatWon(data.totals.total) }}
                </td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </AppCard>
      </div>

      <AppCard v-if="data.rows.length" class="gap-1">
        <div class="flex flex-col gap-1" data-test="by-unit">
          <span class="text-[11.5px] font-semibold tracking-wider text-ink-3">호실별 합계</span>
          <p v-for="u in data.totals.byUnit" :key="u.unitId" class="flex justify-between text-[12.5px] text-ink-2">
            <span>{{ u.unitName }} <span class="text-ink-3">({{ u.count }}건)</span></span>
            <b class="num text-ink">{{ formatWon(u.total) }}</b>
          </p>
        </div>
        <div class="mt-1.5 flex flex-col gap-1" data-test="by-year">
          <span class="text-[11.5px] font-semibold tracking-wider text-ink-3">연도별 합계</span>
          <p v-for="y in data.totals.byYear" :key="y.year" class="flex justify-between text-[12.5px] text-ink-2">
            <span>{{ y.year }}년 <span class="text-ink-3">({{ y.count }}건)</span></span>
            <b class="num text-ink">{{ formatWon(y.total) }}</b>
          </p>
        </div>
      </AppCard>

      <AppCard class="gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11.5px] font-semibold tracking-wider text-ink-3">예정</span>
          <span class="text-[12.5px] text-ink-3">합계 제외</span>
        </div>
        <p class="text-[12.5px] text-ink-3">{{ PENDING_NOTICE }}</p>
        <p v-if="!data.pending.length" class="text-[12.5px] text-ink-2" data-test="no-pending">예정 항목이 없습니다.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li
            v-for="p in data.pending"
            :key="`${p.settlementId}-${p.itemCode}`"
            class="flex items-start justify-between gap-2 text-[12.5px] text-ink-2"
            data-test="pending-row"
          >
            <span class="min-w-0">
              <span class="rounded-chip bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">예정 · {{ pendingStatusLabel(p.status) }}</span>
              {{ p.unitName }} · {{ p.zone }} · {{ p.itemName }}
              <span class="text-ink-3">({{ p.reason }}, 정산 #{{ p.settlementId }})</span>
            </span>
            <b class="num shrink-0 text-ink">{{ formatWon(p.amount) }}</b>
          </li>
        </ul>
      </AppCard>
    </template>
  </section>
</template>
