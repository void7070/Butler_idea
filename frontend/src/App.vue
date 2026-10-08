<script setup>
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { session, clearUser } from './stores/session.js';
import { OWNER_NAV, isNavActive } from './lib/ownerHome.js';
import AppBar from './components/ui/AppBar.vue';
import AppButton from './components/ui/AppButton.vue';
import BottomTabBar from './components/ui/BottomTabBar.vue';

const router = useRouter();
const route = useRoute();
// 공유 링크(/share/...)는 로그인 없이 여는 화면이라, 이 브라우저에 선택된 데모 사용자를 보이지 않는다.
const isSharePage = computed(() => route.path.startsWith('/share/'));
// 인쇄 화면·증빙 패키지(meta.wide)는 가운데 단을 벗어나 넓게 (창 21)
const isWide = computed(() => !!route.meta.wide);
const ROLE_LABEL = { contractor: '시공업자', owner: '임대인', tenant: '임차인' };

// 임대인 하단 탭바 (목업 아이콘). 시공업자·임차인은 탭바 없음.
// 넓은 화면(meta.wide)은 430px 탭바가 본문 위에 떠서 가리므로 숨긴다 — 화면마다 돌아가기 링크가 있다.
const TAB_ICON = { '/owner': 'home', '/owner/reports': 'report', '/owner/repair-ledger': 'ledger' };
const showTabBar = computed(() => session.role === 'owner' && !isSharePage.value && !isWide.value);
const tabs = computed(() =>
  OWNER_NAV.map((item) => ({ ...item, icon: TAB_ICON[item.to], active: isNavActive(item, route.path) })),
);

function changeUser() {
  clearUser();
  router.push('/');
}
</script>

<template>
  <div class="min-h-screen bg-ground text-ink print:bg-white">
    <div
      class="mx-auto flex min-h-screen flex-col print:min-h-0 print:max-w-none print:bg-white"
      :class="isWide ? 'max-w-4xl' : 'max-w-[430px] bg-surface-2'"
    >
      <AppBar class="print:hidden">
        <template #title>
          <span v-if="isSharePage">Butler</span>
          <RouterLink v-else to="/" class="hover:text-accent">Butler</RouterLink>
        </template>
        <template #right>
          <div v-if="session.userId && !isSharePage" class="flex shrink-0 items-center gap-2">
            <span class="text-xs text-ink-3">{{ session.name }} · {{ ROLE_LABEL[session.role] }}</span>
            <AppButton variant="ghost" sm @click="changeUser">사용자 변경</AppButton>
          </div>
        </template>
      </AppBar>
      <main class="flex-1 px-4 py-4 print:p-0" :class="{ 'pb-24': showTabBar }">
        <RouterView />
      </main>
      <BottomTabBar
        v-if="showTabBar"
        :items="tabs"
        class="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] print:hidden"
        data-test="owner-nav"
      />
    </div>
  </div>
</template>
