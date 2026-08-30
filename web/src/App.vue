<script setup>
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useMarketStore } from './stores/market.js';
import { useAccountStore } from './stores/account.js';
import { fmtMoney } from './format.js';
import GuidedTour from './components/GuidedTour.vue';

const route = useRoute();
const market = useMarketStore();
const account = useAccountStore();

onMounted(() => {
  market.init();
  account.refresh();
});
// 路由切换时刷新现金/持仓(下单成交后的兜底刷新也走这里)
watch(() => route.path, () => account.refresh());

function startTour() {
  window.dispatchEvent(new Event('start-tour'));
}
</script>

<template>
  <div class="app-shell">
    <header class="topnav">
      <div class="brand">📈 模拟盘 · 股票学习</div>
      <nav class="tabs">
        <RouterLink to="/" class="tab">行情</RouterLink>
        <RouterLink to="/portfolio" class="tab">持仓</RouterLink>
        <RouterLink to="/review" class="tab">复盘与学习</RouterLink>
      </nav>
      <div class="right">
        <span v-if="market.status.mode === 'afterHours'" class="mode-badge">盘后模式</span>
        <span class="cash num">可用资金 {{ fmtMoney(account.cash) }}</span>
        <button class="btn btn-ghost btn-guide" @click="startTour">新手引导</button>
      </div>
    </header>

    <main class="main">
      <RouterView />
    </main>

    <footer class="statusbar">
      <span>模拟盘 · 不涉及真实资金</span>
      <span>数据每5秒刷新 · 行情来源:腾讯</span>
    </footer>

    <GuidedTour />
  </div>
</template>

<style scoped>
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.topnav {
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 32px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { font-weight: 700; font-size: 16px; white-space: nowrap; }
.tabs { display: flex; gap: 8px; flex: 1; }
.tab {
  padding: 0 16px;
  height: 56px;
  display: flex;
  align-items: center;
  color: var(--muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.tab.router-link-active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.right { display: flex; align-items: center; gap: 12px; }
.cash { font-size: 13px; color: var(--ink); }
.mode-badge {
  font-size: 12px; color: var(--notice);
  background: var(--amber-tint); border: 1px solid rgba(180, 83, 9, 0.25);
  border-radius: 4px; padding: 1px 8px;
}
.btn-guide { min-height: 36px; padding: 0 14px; font-size: 13px; }
.main { flex: 1; }
.statusbar {
  display: flex;
  justify-content: space-between;
  padding: 12px 24px;
  color: var(--muted);
  font-size: 12px;
  border-top: 1px solid var(--border);
}
@media (max-width: 768px) {
  .topnav { flex-wrap: wrap; height: auto; padding: 8px 16px; gap: 8px; }
  .tabs { order: 3; width: 100%; }
  .tab { height: 40px; }
}
</style>
