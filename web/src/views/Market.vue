<script setup>
// 行情页 — 指数卡(主次分明)、搜索、自选列表(5s 轮询)
import { computed } from 'vue';
import { useMarketStore } from '../stores/market.js';
import SearchBox from '../components/SearchBox.vue';
import { fmtNum, fmtPct, fmtChange, clsOf } from '../format.js';

const market = useMarketStore();

const rows = computed(() =>
  market.watchlist.map((s) => ({ symbol: s, ...market.quotes[s] })).filter((r) => r.name)
);
const INDEX_LABEL = { sh000001: '上证指数', sz399001: '深证成指', sz399006: '创业板指' };
const indices = computed(() =>
  market.indices.map((i) => ({ ...i, label: INDEX_LABEL[i.symbol] || i.name }))
);
const primary = computed(() => indices.value.find((i) => i.symbol === 'sh000001') || indices.value[0]);
const others = computed(() => indices.value.filter((i) => i.symbol !== primary.value?.symbol));
</script>

<template>
  <div class="page">
    <!-- 行情降级横幅 -->
    <div v-if="market.quotesError" class="degraded">
      ⚠ 行情获取失败,当前显示 {{ market.quoteTime ? market.quoteTime.toTimeString().slice(0, 5) : '旧' }} 数据,稍后自动重试
    </div>

    <!-- 指数卡:上证主卡 2fr + 两张 1fr -->
    <section class="index-strip">
      <div v-if="primary" class="card index-card primary" @click="$router.push('/stock/' + primary.symbol)">
        <div class="idx-name">{{ primary.label }}</div>
        <div class="idx-price num" :class="clsOf(primary.changePct)">{{ fmtNum(primary.last) }}</div>
        <div class="idx-change num" :class="clsOf(primary.changePct)">
          {{ fmtChange(primary.change, primary.changePct) }}
        </div>
      </div>
      <div v-for="i in others" :key="i.symbol" class="card index-card" @click="$router.push('/stock/' + i.symbol)">
        <div class="idx-name">{{ i.label }}</div>
        <div class="idx-price num" :class="clsOf(i.changePct)">{{ fmtNum(i.last) }}</div>
        <div class="idx-change num" :class="clsOf(i.changePct)">{{ fmtChange(i.change, i.changePct) }}</div>
      </div>
    </section>

    <!-- 搜索 -->
    <section class="search-row">
      <SearchBox />
      <div class="search-tip">输入代码或名称片段,回车直达个股页</div>
    </section>

    <!-- 自选列表 -->
    <section class="card watchlist-card">
      <div class="wl-head">
        <h3>我的自选</h3>
        <span class="wl-count num">{{ rows.length }} 只</span>
      </div>
      <div v-if="!rows.length" class="empty">
        <div class="empty-icon">🔭</div>
        <p>自选还是空的,用上面的搜索框找一只你感兴趣的股票加进来吧</p>
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th class="tl">股票</th>
            <th class="tr">现价</th>
            <th class="tr">涨跌额</th>
            <th class="tr">涨跌幅</th>
            <th class="tr">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.symbol" @click="$router.push('/stock/' + r.symbol)">
            <td class="tl">
              <div class="stock-name">{{ r.name }}</div>
              <div class="stock-code num">{{ r.symbol }}</div>
            </td>
            <td class="tr num" :class="clsOf(r.changePct)">{{ fmtNum(r.last) }}</td>
            <td class="tr num" :class="clsOf(r.changePct)">{{ r.change >= 0 ? '+' : '' }}{{ fmtNum(r.change) }}</td>
            <td class="tr num" :class="clsOf(r.changePct)">{{ r.changePct >= 0 ? '+' : '' }}{{ fmtPct(r.changePct) }}</td>
            <td class="tr" @click.stop>
              <button class="btn btn-buy btn-op" @click="$router.push('/stock/' + r.symbol)">买入</button>
              <button class="btn btn-ghost btn-op" @click="market.toggleWatch(r.symbol)">移除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.degraded {
  background: var(--amber-tint); border: 1px solid rgba(180,83,9,0.25); color: var(--notice);
  border-radius: 8px; padding: 8px 14px; font-size: 13px; margin-bottom: 16px;
}
.index-strip { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.index-card { padding: 16px 20px; cursor: pointer; transition: box-shadow 0.15s; }
.index-card:hover { box-shadow: 0 4px 16px rgba(24,24,27,0.08); }
.index-card.primary { border-left: 3px solid var(--accent); }
.idx-name { font-size: 13px; color: var(--muted); margin-bottom: 4px; }
.idx-price { font-size: 26px; font-weight: 700; }
.index-card.primary .idx-price { font-size: 32px; }
.idx-change { font-size: 13px; margin-top: 2px; }
.search-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.search-tip { font-size: 12px; color: var(--muted); }
.wl-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.wl-head h3 { font-size: 15px; }
.wl-count { font-size: 12px; color: var(--muted); }
.empty { padding: 48px 24px; text-align: center; color: var(--muted); }
.empty-icon { font-size: 32px; margin-bottom: 8px; }
.table { width: 100%; border-collapse: collapse; }
.table th {
  font-size: 12px; color: var(--muted); font-weight: 500; letter-spacing: 0.05em;
  padding: 10px 18px; border-bottom: 1px solid var(--border); text-align: right;
}
.table th.tl, .table td.tl { text-align: left; }
.table td { padding: 12px 18px; border-bottom: 1px solid var(--border); }
.table tbody tr { cursor: pointer; }
.table tbody tr:hover { background: #f4f4f5; }
.table tbody tr:last-child td { border-bottom: none; }
.stock-name { font-weight: 600; }
.stock-code { font-size: 12px; color: var(--muted); }
.btn-op { min-height: 30px; padding: 0 12px; font-size: 12px; }
@media (max-width: 768px) {
  .index-strip { grid-template-columns: 1fr; }
  .search-row { flex-direction: column; align-items: stretch; }
}
</style>
