<script setup>
// 임차인 입주 리포트 화면의 "이상 제보" / "구역 확인" (progress.md 창 10).
// 계약 시작일부터 7일 안에만 쓸 수 있다(백엔드가 400으로 막는다). 제보는 임대인이 승인해야 입주 기준선에 들어간다.
import { ref, computed, onMounted } from 'vue';
import { apiFetch } from '../lib/api.js';
import { fileToDataUrl, isWithinSize } from '../lib/image.js';
import { stateBadge } from '../lib/diffView.js';
import {
  REPORT_STATE_OPTIONS,
  statusBadge,
  deadlineBadge,
  windowText,
  sortReports,
  zoneCells,
  itemsOfZone,
  reportFormError,
  reportPayload,
} from '../lib/tenantReportView.js';
import AppButton from './ui/AppButton.vue';
import AppCard from './ui/AppCard.vue';
import Chip from './ui/Chip.vue';
import DdayChip from './ui/DdayChip.vue';
import NumText from './ui/NumText.vue';
import Pill from './ui/Pill.vue';
import SegmentedControl from './ui/SegmentedControl.vue';

const props = defineProps({
  reportId: { type: [String, Number], required: true },
});

const data = ref(null);
const catalog = ref(null);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const panel = ref(''); // '' | 'report' | 'zones'
const emptyForm = () => ({ zone: '', itemCode: '', state: 'minor', text: '', imageBase64: '' });
const form = ref(emptyForm());

const deadline = computed(() => deadlineBadge(data.value?.window));
const open = computed(() => deadline.value.open);
const cells = computed(() => zoneCells(data.value?.zones));
const reports = computed(() => sortReports(data.value?.tenantReports));
const zoneItems = computed(() => itemsOfZone(catalog.value, form.value.zone));

async function load() {
  try {
    data.value = await apiFetch(`/api/reports/${props.reportId}/tenant-reports`);
  } catch (e) {
    error.value = e.message;
  }
}

async function togglePanel(name) {
  notice.value = '';
  error.value = '';
  panel.value = panel.value === name ? '' : name;
  if (name === 'report' && !catalog.value) {
    try {
      catalog.value = await apiFetch('/api/item-catalog');
    } catch (e) {
      error.value = e.message;
    }
  }
}

function pickZone(zone) {
  form.value.zone = zone;
  form.value.itemCode = '';
}

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!isWithinSize(file)) {
    error.value = '사진 1장은 10MB를 넘을 수 없습니다.';
    return;
  }
  form.value.imageBase64 = await fileToDataUrl(file);
}

async function submitReport() {
  const msg = reportFormError(form.value);
  if (msg) {
    error.value = msg;
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await apiFetch(`/api/reports/${props.reportId}/tenant-reports`, {
      method: 'POST',
      body: JSON.stringify(reportPayload(form.value)),
    });
    form.value = emptyForm();
    notice.value = '제보했습니다. 임대인이 승인하면 입주 기준선에 반영됩니다.';
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function confirmZone(zone) {
  busy.value = true;
  error.value = '';
  try {
    const status = await apiFetch(`/api/reports/${props.reportId}/zone-confirm`, {
      method: 'POST',
      body: JSON.stringify({ zone }),
    });
    data.value = { ...data.value, ...status };
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <!-- 목업 t-movein: accent 테두리 카드 -->
  <AppCard v-if="data" class="border-accent! print:hidden" data-test="tenant-baseline">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[15px] font-semibold">입주 확인</h3>
      <DdayChip :severity="deadline.severity" data-test="deadline"><NumText :text="deadline.label" /></DdayChip>
    </div>
    <span class="text-[12.5px] text-ink-3"><NumText :text="windowText(data.window)" /></span>
    <p class="text-[12.5px] text-ink-2">
      리포트에 없는 이상을 제보하거나 구역을 확인하세요. 제보는 임대인이 승인해야 입주 기준선에 들어갑니다.
    </p>

    <div class="grid grid-cols-2 gap-2.5">
      <AppButton
        :variant="panel === 'report' ? 'primary' : 'ghost'"
        sm
        class="w-full"
        :disabled="!open"
        data-test="open-report"
        @click="togglePanel('report')"
      >
        이상 제보
      </AppButton>
      <AppButton
        :variant="panel === 'zones' ? 'primary' : 'ghost'"
        sm
        class="w-full"
        :disabled="!open"
        data-test="open-zones"
        @click="togglePanel('zones')"
      >
        <span>구역 확인 (<span class="num">{{ data.zones.length - data.unconfirmedZones.length }}/{{ data.zones.length }}</span>)</span>
      </AppButton>
    </div>

    <p v-if="error" class="rounded-[10px] bg-crit-soft px-3 py-2 text-[13px] text-crit">{{ error }}</p>
    <p v-if="notice" class="rounded-[10px] bg-ok-soft px-3 py-2 text-[13px] text-ok">{{ notice }}</p>

    <!-- 이상 제보 폼 -->
    <div v-if="panel === 'report' && open" class="flex flex-col gap-2.5" data-test="report-form">
      <div class="flex flex-col gap-1.5">
        <span class="text-[12.5px] text-ink-2">구역</span>
        <div class="flex flex-wrap gap-1.5">
          <Chip v-for="z in catalog?.zones ?? []" :key="z" :pressed="form.zone === z" @click="pickZone(z)">{{ z }}</Chip>
        </div>
      </div>
      <div v-if="form.zone" class="flex flex-col gap-1.5">
        <span class="text-[12.5px] text-ink-2">항목</span>
        <div class="flex flex-wrap gap-1.5">
          <Chip v-for="it in zoneItems" :key="it.code" :pressed="form.itemCode === it.code" @click="form.itemCode = it.code">
            {{ it.name }}
          </Chip>
        </div>
      </div>
      <SegmentedControl v-model="form.state" :options="REPORT_STATE_OPTIONS" aria-label="상태" />
      <textarea
        v-model="form.text"
        rows="2"
        placeholder="어떤 이상인지 적어 주세요 (예: 욕조 주변 실리콘 변색)"
        class="min-h-[72px] w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink"
      />
      <input
        type="file"
        accept="image/*"
        class="text-[12.5px] text-ink-3 file:mr-2 file:rounded-[9px] file:border file:border-line file:bg-surface file:px-[11px] file:py-[7px] file:text-[12.5px] file:font-semibold file:text-ink"
        @change="onFile"
      />
      <img v-if="form.imageBase64" :src="form.imageBase64" alt="" class="aspect-[4/3] w-32 rounded-[10px] object-cover" />
      <AppButton :disabled="busy" data-test="submit-report" @click="submitReport">제보하기</AppButton>
    </div>

    <!-- 구역 확인 -->
    <div v-if="panel === 'zones' && open" class="flex flex-col gap-1.5" data-test="zone-panel">
      <div v-for="c in cells" :key="c.zone" class="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
        <span>{{ c.zone }}</span>
        <AppButton v-if="!c.tenantConfirmed" variant="ghost" sm :disabled="busy" @click="confirmZone(c.zone)">
          이상 없음 확인
        </AppButton>
        <Pill v-else tone="ok">✓ {{ c.label }}</Pill>
      </div>
    </div>

    <!-- 내 제보 -->
    <template v-if="reports.length">
      <div class="h-px bg-line"></div>
      <ul class="flex flex-col gap-1.5 text-[12.5px] text-ink-2">
        <li v-for="tr in reports" :key="tr.id" class="flex flex-wrap items-center justify-between gap-2">
          <span>
            {{ tr.zone }} · <b class="font-semibold text-ink">{{ tr.name }}</b>
            <Pill :tone="stateBadge(tr.state).tone" class="ml-1">{{ stateBadge(tr.state).label }}</Pill>
          </span>
          <Pill :tone="statusBadge(tr.status).tone">{{ statusBadge(tr.status).label }}</Pill>
        </li>
      </ul>
    </template>
  </AppCard>
</template>
