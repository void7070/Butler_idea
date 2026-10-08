<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { setUser, homePathForRole } from '../stores/session.js';
import AppCard from '../components/ui/AppCard.vue';
import Pill from '../components/ui/Pill.vue';

const router = useRouter();
const users = ref([]);
const error = ref('');
const loading = ref(true);

const ROLE_LABEL = { contractor: '시공업자', owner: '임대인', tenant: '임차인' };
// 목업 역할 색: 임대인 accent, 임차인 warn, 시공업자 seal
const ROLE_TONE = { contractor: 'seal', owner: 'acc', tenant: 'warn' };

const groups = computed(() => {
  const by = { contractor: [], owner: [], tenant: [] };
  for (const u of users.value) (by[u.role] ??= []).push(u);
  return by;
});

onMounted(async () => {
  try {
    const data = await apiFetch('/api/demo/users');
    users.value = data.users;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function select(user) {
  setUser(user);
  router.push(homePathForRole(user.role));
}
</script>

<template>
  <section class="flex flex-col gap-3.5 pt-0.5">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-xl font-bold tracking-tight">데모 사용자 선택</h2>
      <p class="text-[13px] text-ink-2">역할을 선택하면 해당 화면으로 이동합니다. (로그인 없음)</p>
    </div>

    <p v-if="loading" class="text-[12.5px] text-ink-3">불러오는 중…</p>
    <p v-if="error" class="rounded-btn bg-crit-soft px-3.5 py-3 text-[13px] text-crit">{{ error }}</p>

    <div v-for="(list, role) in groups" :key="role" v-show="list.length" class="flex flex-col gap-2">
      <h3 class="text-[11.5px] font-semibold tracking-wider text-ink-3">{{ ROLE_LABEL[role] }}</h3>
      <AppCard v-for="u in list" :key="u.id" as="button" type="button" tap class="gap-1" @click="select(u)">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[15px] font-semibold">{{ u.name }}</span>
          <Pill :tone="ROLE_TONE[u.role]">{{ ROLE_LABEL[u.role] }}</Pill>
        </div>
        <span v-if="u.org" class="text-[12.5px] text-ink-2">{{ u.org }}</span>
      </AppCard>
    </div>
  </section>
</template>
