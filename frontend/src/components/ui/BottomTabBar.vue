<script setup>
// 목업 .tabbar. items = [{ label, to, icon: 'home'|'report'|'ledger', active }] — 활성 여부는 부모가 계산한다.
defineProps({
  items: { type: Array, required: true },
});

const ICONS = {
  home: { sw: '1.8', paths: ['M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z'], rect: null },
  report: { sw: '1.8', paths: ['M8 8h8M8 12h8M8 16h5'], rect: { x: 5, y: 3, width: 14, height: 18, rx: 1.5 } },
  ledger: { sw: '1.8', paths: ['M4 5h16v14H4z', 'M4 10h16M10 10v9'], rect: null },
};
</script>

<template>
  <nav
    class="grid border-t border-line bg-surface px-1.5 pt-1.5 pb-3"
    :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
    aria-label="하단 메뉴"
  >
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="flex flex-col items-center gap-0.5 py-1.5 text-[11px]"
      :class="item.active ? 'font-semibold text-accent' : 'text-ink-3'"
      :aria-current="item.active ? 'page' : undefined"
    >
      <svg
        v-if="ICONS[item.icon]"
        class="h-[22px] w-[22px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="ICONS[item.icon].sw"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect v-if="ICONS[item.icon].rect" v-bind="ICONS[item.icon].rect" />
        <path v-for="d in ICONS[item.icon].paths" :key="d" :d="d" />
      </svg>
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
