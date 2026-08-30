<script setup>
// 搜索框 — 输入防抖联想,回车/点击进个股页,可一键加自选
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';
import { useMarketStore } from '../stores/market.js';
import { boardName } from '../format.js';

const router = useRouter();
const market = useMarketStore();
const q = ref('');
const list = ref([]);
const open = ref(false);
const root = ref(null);

let timer = null;
watch(q, (v) => {
  clearTimeout(timer);
  if (!v.trim()) {
    list.value = [];
    return;
  }
  timer = setTimeout(async () => {
    try {
      const r = await api.search(v.trim());
      list.value = r.list || [];
      open.value = true;
    } catch {
      list.value = [];
    }
  }, 250);
});

function go(symbol) {
  open.value = false;
  q.value = '';
  router.push(`/stock/${symbol}`);
}
function onKeydown(e) {
  if (e.key === 'Enter' && list.value.length) go(list.value[0].symbol);
  if (e.key === 'Escape') open.value = false;
}
function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false;
}
document.addEventListener('click', onDocClick);
</script>

<template>
  <div ref="root" class="searchbox">
    <span class="search-icon">🔍</span>
    <input
      v-model="q"
      class="search-input"
      type="text"
      placeholder="搜代码或名称,如 600519 / 茅台"
      @keydown="onKeydown"
      @focus="list.length && (open = true)"
    />
    <div v-if="open && q.trim()" class="search-drop">
      <div v-if="!list.length" class="search-empty">没有找到相关 A 股,换个关键词试试</div>
      <div
        v-for="item in list"
        :key="item.symbol"
        class="search-item"
        @click="go(item.symbol)"
      >
        <span class="search-code num">{{ item.code }}</span>
        <span class="search-name">{{ item.name }}</span>
        <span class="chip">{{ boardName[item.board] || item.board }}</span>
        <button
          class="btn btn-ghost btn-sm"
          :class="{ active: market.watchlist.includes(item.symbol) }"
          @click.stop="market.toggleWatch(item.symbol)"
        >
          {{ market.watchlist.includes(item.symbol) ? '已自选' : '+自选' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.searchbox { position: relative; width: min(420px, 100%); }
.search-input {
  width: 100%;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 0 14px 0 40px;
  font-size: 14px;
}
.search-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.search-icon { position: absolute; left: 14px; top: 13px; font-size: 15px; opacity: 0.6; }
.search-drop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(24,24,27,0.1);
  z-index: 50;
  max-height: 360px;
  overflow-y: auto;
}
.search-empty { padding: 16px; color: var(--muted); font-size: 13px; }
.search-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
}
.search-item:hover { background: #f4f4f5; }
.search-code { width: 64px; color: var(--muted); }
.search-name { flex: 1; }
.chip {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 6px;
}
.btn-sm { min-height: 28px; padding: 0 10px; font-size: 12px; }
.btn-sm.active { color: var(--accent); border-color: var(--accent); }
</style>
