<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import {
  APPLY_MODE_LABEL,
  APPLY_MODE_TONE,
  LEASE_NOTICES,
  PARAM_FIELDS,
  emptyLeaseForm,
  toggleTemplateClause,
  isTemplateSelected,
  addTextClause,
  removeClause,
  clausePreview,
  validateLeaseForm,
  hasFormErrors,
  buildLeasePayload,
} from '../lib/leaseForm.js';
import AppButton from '../components/ui/AppButton.vue';
import AppCard from '../components/ui/AppCard.vue';
import Chip from '../components/ui/Chip.vue';
import Pill from '../components/ui/Pill.vue';

// 임대인 계약·특약 등록 (창 12). 특약 번호는 목록 순서대로 제1항부터 매겨진다.
const route = useRoute();
const router = useRouter();
const unitId = computed(() => Number(route.params.id));

const unitName = ref('');
const tenants = ref([]);
const templates = ref([]);
const form = ref(emptyLeaseForm());
const errors = ref({ clauses: {} });
const submitted = ref(false);
const error = ref('');
const loading = ref(true);
const saving = ref(false);

const templateOf = (code) => templates.value.find((t) => t.code === code);

// 목업 .field / .input
const INPUT = 'w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink';

onMounted(async () => {
  try {
    const [units, users, tpl] = await Promise.all([
      apiFetch('/api/units'),
      apiFetch('/api/demo/users'),
      apiFetch('/api/clause-templates'),
    ]);
    unitName.value = units.units.find((u) => u.id === unitId.value)?.name ?? '';
    tenants.value = users.users.filter((u) => u.role === 'tenant');
    templates.value = tpl.templates;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function revalidate() {
  if (submitted.value) errors.value = validateLeaseForm(form.value);
}

function toggle(template) {
  form.value.clauses = toggleTemplateClause(form.value.clauses, template);
  revalidate();
}

function addText() {
  form.value.clauses = addTextClause(form.value.clauses);
}

function remove(index) {
  form.value.clauses = removeClause(form.value.clauses, index);
  revalidate();
}

async function submit() {
  submitted.value = true;
  errors.value = validateLeaseForm(form.value);
  if (hasFormErrors(errors.value)) return;
  saving.value = true;
  error.value = '';
  try {
    await apiFetch(`/api/units/${unitId.value}/leases`, {
      method: 'POST',
      body: JSON.stringify(buildLeasePayload(form.value)),
    });
    router.push(`/owner/units/${unitId.value}/leases`);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3.5">
    <RouterLink :to="`/owner/units/${unitId}/leases`" class="self-start text-[13px] font-semibold text-accent">← 계약 이력으로</RouterLink>
    <h2 class="text-xl font-bold tracking-tight">계약·특약 등록 <span v-if="unitName" class="text-ink-3">· {{ unitName }}</span></h2>
    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>

    <form v-if="!loading" class="flex flex-col gap-3.5" @submit.prevent="submit">
      <!-- 계약 기본 (목업 lease-form: eyebrow + field) -->
      <h3 class="text-[11.5px] font-semibold tracking-[.06em] text-ink-3">계약 정보</h3>
      <label class="flex flex-col gap-[5px]">
        <span class="text-xs font-medium text-ink-2">임차인</span>
        <select v-model="form.tenantUserId" :class="INPUT" data-test="tenant" @change="revalidate">
          <option value="">선택하세요</option>
          <option v-for="t in tenants" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
        </select>
        <span v-if="errors.tenantUserId" class="text-xs text-crit">{{ errors.tenantUserId }}</span>
      </label>
      <div class="grid grid-cols-2 gap-2.5">
        <label class="flex min-w-0 flex-col gap-[5px]">
          <span class="text-xs font-medium text-ink-2">보증금(원)</span>
          <input v-model="form.deposit" inputmode="numeric" placeholder="예: 30,000,000" :class="[INPUT, 'num']" @input="revalidate" />
          <span v-if="errors.deposit" class="text-xs text-crit">{{ errors.deposit }}</span>
        </label>
        <label class="flex min-w-0 flex-col gap-[5px]">
          <span class="text-xs font-medium text-ink-2">월세(원)</span>
          <input v-model="form.monthlyRent" inputmode="numeric" placeholder="예: 900,000" :class="[INPUT, 'num']" @input="revalidate" />
          <span v-if="errors.monthlyRent" class="text-xs text-crit">{{ errors.monthlyRent }}</span>
        </label>
        <label class="flex min-w-0 flex-col gap-[5px]">
          <span class="text-xs font-medium text-ink-2">계약 시작일</span>
          <input v-model="form.startDate" type="date" :class="[INPUT, 'num min-w-0 px-2']" @change="revalidate" />
        </label>
        <label class="flex min-w-0 flex-col gap-[5px]">
          <span class="text-xs font-medium text-ink-2">계약 종료일</span>
          <input v-model="form.endDate" type="date" :class="[INPUT, 'num min-w-0 px-2']" @change="revalidate" />
        </label>
      </div>
      <p v-if="errors.period" class="text-xs text-crit">{{ errors.period }}</p>

      <!-- 특약 -->
      <h3 class="mt-1 text-[11.5px] font-semibold tracking-[.06em] text-ink-3">특약</h3>
      <ul class="flex flex-col text-xs text-ink-3">
        <li v-for="n in LEASE_NOTICES" :key="n">· {{ n }}</li>
      </ul>

      <div class="flex flex-col gap-1.5">
        <p class="text-[12.5px] text-ink-2">템플릿 특약 (눌러서 추가/빼기)</p>
        <div class="flex flex-wrap gap-1.5">
          <Chip
            v-for="t in templates"
            :key="t.code"
            :pressed="isTemplateSelected(form.clauses, t.code)"
            data-test="template-chip"
            @click="toggle(t)"
          >
            {{ t.title }}
            <span class="ml-0.5 font-normal opacity-80">· {{ APPLY_MODE_LABEL[t.applyMode] }}</span>
          </Chip>
        </div>
      </div>

      <p v-if="form.clauses.length === 0" class="rounded-btn bg-surface px-3.5 py-3 text-[13px] text-ink-2">추가한 특약이 없습니다.</p>
      <ol class="flex flex-col gap-2.5">
        <AppCard v-for="(c, i) in form.clauses" :key="i" as="li" class="gap-1.5" data-test="clause-row">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <b class="text-[13px]">
              제{{ i + 1 }}항 · {{ c.kind === 'template' ? templateOf(c.templateCode)?.title : '직접 입력' }}
            </b>
            <Pill v-if="c.kind === 'template'" :tone="APPLY_MODE_TONE[templateOf(c.templateCode)?.applyMode]">
              {{ APPLY_MODE_LABEL[templateOf(c.templateCode)?.applyMode] }}
            </Pill>
            <Pill v-else tone="warn">{{ APPLY_MODE_LABEL.manual }}</Pill>
          </div>

          <template v-if="c.kind === 'template'">
            <div v-if="Object.keys(c.params).length" class="flex flex-wrap gap-2.5">
              <label v-for="(v, key) in c.params" :key="key" class="flex flex-col gap-[5px]">
                <span class="text-xs font-medium text-ink-2">{{ PARAM_FIELDS[key]?.label ?? key }}</span>
                <span class="flex items-center gap-1.5">
                  <input v-model="c.params[key]" inputmode="numeric" :class="[INPUT, 'num w-36']" @input="revalidate" />
                  <span class="shrink-0 whitespace-nowrap text-[12.5px] text-ink-3">{{ PARAM_FIELDS[key]?.unit }}</span>
                </span>
              </label>
            </div>
            <p class="border-l-[3px] border-line pl-2.5 text-[12.5px] text-ink-2" data-test="clause-preview">
              "{{ clausePreview(templateOf(c.templateCode), c.params) }}"
            </p>
          </template>
          <textarea
            v-else
            v-model="c.text"
            rows="2"
            maxlength="500"
            placeholder="계약서에 들어갈 특약 문장"
            :class="[INPUT, 'min-h-[72px] resize-none']"
            @input="revalidate"
          />
          <p v-if="errors.clauses[i]" class="text-xs text-crit">{{ errors.clauses[i] }}</p>
          <button type="button" class="self-start text-[13px] font-semibold text-accent" @click="remove(i)">삭제</button>
        </AppCard>
      </ol>
      <AppButton variant="ghost" @click="addText">+ 직접 입력 특약 추가</AppButton>

      <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>
      <AppButton type="submit" :disabled="saving">{{ saving ? '등록 중…' : '계약 등록' }}</AppButton>
    </form>
  </section>
</template>
