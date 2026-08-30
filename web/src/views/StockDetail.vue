<script setup>
// 个股页 — 报价区(术语卡)、K线(分时/日K/周K)、五档盘口、指标区、下单入口
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMarketStore } from '../stores/market.js';
import { useAccountStore } from '../stores/account.js';
import KLineChart from '../components/KLineChart.vue';
import OrderPanel from '../components/OrderPanel.vue';
import TermPopover from '../components/TermPopover.vue';
import { fmtNum, fmtPct, fmtChange, clsOf, fmtHand, fmtYuan, fmtYi, boardName } from '../format.js';

const route = useRoute();
const router = useRouter();
const market = useMarketStore();
const account = useAccountStore();

const symbol = computed(() => String(route.params.symbol || '').toLowerCase());
const quote = computed(() => market.quotes[symbol.value] || null);
const position = computed(() => account.positionOf(symbol.value));
const klt = ref('day');
const panelOpen = ref(false);

// 板段:代码前缀判定(与引擎 boardOf 同规则)
const board = computed(() => {
  const code = symbol.value.slice(2);
  if (code.startsWith('688')) return 'star';
  if (code.startsWith('30')) return 'gem';
  return 'main';
});

onMounted(async () => {
  market.init();
  market.track(symbol.value);
  account.refresh();
});
onBeforeUnmount(() => market.untrack(symbol.value));

function onTradeDone() {
  account.refresh(); // 成交后刷新现金/持仓
}

// 五档量条宽度:十档最大量为 100%
const bookMax = computed(() => {
  const q = quote.value;
  if (!q) return 1;
  return Math.max(...[...(q.ask || []), ...(q.bid || [])].map((x) => x.qty || 0), 1);
});
const bookW = (side, i) => {
  const v = quote.value?.[side]?.[i]?.qty || 0;
  return `${Math.max((v / bookMax.value) * 100, 2)}%`;
};
</script>

<template>
  <div class="page" v-if="quote">
    <!-- 头部:名称/代码/板块/盘中角标 + 买卖 -->
    <header class="sd-head">
      <div class="sd-title">
        <h1>{{ quote.name }}</h1>
        <span class="code num">{{ symbol }}</span>
        <span class="chip">{{ boardName[board] }}</span>
        <span class="mode" :class="market.status.mode">
          <i class="pulse"></i>{{ market.status.mode === 'live' ? '盘中' : '盘后' }}
        </span>
        <button
          v-if="market.watchlist.includes(symbol)"
          class="btn btn-ghost btn-star on"
          @click="market.toggleWatch(symbol)"
        >★ 已自选</button>
        <button v-else class="btn btn-ghost btn-star" @click="market.toggleWatch(symbol)">☆ 加自选</button>
      </div>
      <div class="order-entry">
        <button class="btn btn-buy btn-lg" @click="panelOpen = 'buy'">买入</button>
        <button class="btn btn-sell btn-lg" :disabled="!position" @click="panelOpen = 'sell'">卖出</button>
      </div>
    </header>

    <div class="sd-grid">
      <!-- 左:图表 -->
      <section class="sd-left">
        <div class="card chart-ctrl">
          <div class="seg">
            <button v-for="k in ['minute', 'day', 'week']" :key="k" :class="{ on: klt === k }" @click="klt = k">
              {{ { minute: '分时', day: '日K', week: '周K' }[k] }}
            </button>
          </div>
          <span class="qtip num">{{ quote.time }}</span>
        </div>
        <div class="card chart-box">
          <KLineChart :symbol="symbol" :klt="klt" :limit="120" />
        </div>
      </section>

      <!-- 右:报价 + 五档 + 指标 -->
      <section class="sd-right">
        <div class="card q-block">
          <div class="q-main">
            <span class="q-last num" :class="clsOf(quote.changePct)">{{ fmtNum(quote.last) }}</span>
            <span class="q-chg num" :class="clsOf(quote.changePct)">{{ fmtChange(quote.change, quote.changePct) }}</span>
          </div>
          <div class="q-grid">
            <div><TermPopover word="开盘价" /><b class="num">{{ fmtNum(quote.open) }}</b></div>
            <div><TermPopover word="收盘价" /><b class="num">{{ fmtNum(quote.prevClose) }}</b></div>
            <div><span class="lab">最高</span><b class="num up">{{ fmtNum(quote.high) }}</b></div>
            <div><span class="lab">最低</span><b class="num down">{{ fmtNum(quote.low) }}</b></div>
          </div>
          <div v-if="position" class="pos-line">
            持仓 <b class="num">{{ position.totalQty }}</b> 股 · 可用 <b class="num">{{ position.availableQty }}</b>
            <span v-if="position.lockedQty > 0" class="t1-badge">T+1 锁 {{ position.lockedQty }}</span>
          </div>
        </div>

        <!-- 五档盘口 -->
        <div class="card book">
          <div class="book-head"><TermPopover word="五档盘口" /></div>
          <div class="book-body">
            <div v-for="(a, i) in [...(quote.ask || [])].reverse()" :key="'a' + i" class="book-row">
              <span class="lv">卖{{ 5 - i }}</span>
              <span class="px num down">{{ fmtNum(a.price) }}</span>
              <span class="vol num">{{ a.qty }}</span>
              <i class="bar jade" :style="{ width: bookW('ask', 4 - i) }"></i>
            </div>
            <div class="book-split"></div>
            <div v-for="(b, i) in quote.bid || []" :key="'b' + i" class="book-row">
              <span class="lv">买{{ i + 1 }}</span>
              <span class="px num up">{{ fmtNum(b.price) }}</span>
              <span class="vol num">{{ b.qty }}</span>
              <i class="bar red" :style="{ width: bookW('bid', i) }"></i>
            </div>
          </div>
        </div>

        <!-- 详细指标 -->
        <div class="card metrics">
          <div class="m-row"><span><TermPopover word="成交量" /></span><b class="num">{{ fmtHand(quote.volume) }}</b></div>
          <div class="m-row"><span><TermPopover word="成交额" /></span><b class="num">{{ fmtYuan(quote.amount) }}</b></div>
          <div class="m-row"><span><TermPopover word="换手率" /></span><b class="num">{{ fmtPct(quote.turnoverRate) }}</b></div>
          <div class="m-row"><span><TermPopover word="振幅" /></span><b class="num">{{ fmtPct(quote.amplitude) }}</b></div>
          <div class="m-row"><span><TermPopover word="市盈率(PE)" /></span><b class="num">{{ fmtNum(quote.pe) }}</b></div>
          <div class="m-row"><span><TermPopover word="市净率(PB)" /></span><b class="num">{{ fmtNum(quote.pb) }}</b></div>
          <div class="m-row"><span><TermPopover word="流通市值 / 总市值" /></span><b class="num">{{ fmtYi(quote.floatMv) }} / {{ fmtYi(quote.totalMv) }}</b></div>
        </div>
      </section>
    </div>

    <!-- 教育引导条 -->
    <div class="learn-strip">
      <div>
        <b>第一次看K线?</b>
        <span>阅读 3 分钟入门指南,理解蜡烛图背后的市场情绪。</span>
      </div>
      <button class="btn btn-ghost" @click="router.push('/review')">开始学习</button>
    </div>

    <!-- 下单抽屉 -->
    <OrderPanel
      v-if="panelOpen"
      :symbol="symbol"
      :name="quote.name"
      :quote="quote"
      :position="position"
      :cash="account.cash"
      :mode="market.status.mode"
      :initial-side="panelOpen"
      @close="panelOpen = false"
      @done="onTradeDone"
    />
  </div>

  <!-- 报价未就绪:骨架屏 -->
  <div v-else class="page loading-page">
    <div class="sk sk-title"></div>
    <div class="sk sk-chart"></div>
  </div>
</template>

<style scoped>
.sd-head {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 16px;
  flex-wrap: wrap;
}
.sd-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sd-title h1 { font-size: 20px; }
.code { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
.chip { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 8px; }
.mode { font-size: 12px; display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 4px; }
.mode.live { color: var(--up); background: var(--up-tint); }
.mode.afterHours { color: var(--notice); background: var(--amber-tint); }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
@keyframes pulse { 50% { opacity: 0.4; } }
.btn-star { min-height: 30px; padding: 0 12px; font-size: 12px; }
.btn-star.on { color: var(--accent); border-color: var(--accent); }
.btn-lg { min-width: 110px; min-height: 44px; font-weight: 700; }
.sd-grid { display: grid; grid-template-columns: 7fr 5fr; gap: 16px; }
.sd-left { display: flex; flex-direction: column; gap: 12px; }
.chart-ctrl { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; }
.seg { display: flex; gap: 2px; background: var(--canvas); padding: 3px; border-radius: 8px; }
.seg button {
  border: none; background: none; padding: 5px 14px; font-size: 13px; color: var(--muted);
  border-radius: 6px; cursor: pointer;
}
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: 0 1px 3px rgba(24,24,27,0.12); }
.qtip { font-size: 12px; color: var(--muted); }
.chart-box { height: 520px; overflow: hidden; }
.sd-right { display: flex; flex-direction: column; gap: 16px; }
.q-block { padding: 16px 18px; }
.q-main { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.q-last { font-size: 30px; font-weight: 700; }
.q-chg { font-size: 15px; font-weight: 600; }
.q-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.q-grid > div { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.q-grid .lab { color: var(--muted); }
.q-grid b { font-weight: 600; font-size: 14px; }
.pos-line { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 13px; color: var(--muted); }
.pos-line b { color: var(--ink); }
.t1-badge {
  margin-left: 8px; font-size: 11px; color: var(--notice);
  border: 1px solid rgba(180,83,9,0.3); border-radius: 4px; padding: 0 6px;
}
.book-head { padding: 10px 16px; border-bottom: 1px solid var(--border); background: #fafafa; border-radius: 12px 12px 0 0; font-size: 13px; color: var(--muted); }
.book-body { padding: 8px 10px; }
.book-row {
  position: relative; display: flex; align-items: center; gap: 8px;
  padding: 4px 8px; font-size: 13px;
}
.book-row .lv { color: var(--muted); width: 32px; }
.book-row .px { flex: 1; text-align: right; padding-right: 16px; }
.book-row .vol { width: 64px; text-align: right; color: var(--ink); }
.bar { position: absolute; right: 0; top: 2px; bottom: 2px; border-radius: 3px 0 0 3px; z-index: 0; }
.bar.red { background: rgba(214, 69, 69, 0.13); }
.bar.jade { background: rgba(30, 122, 90, 0.13); }
.book-row span { position: relative; z-index: 1; }
.book-split { border-top: 1px dashed var(--border); margin: 6px 0; }
.metrics { padding: 12px 18px; }
.m-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--muted);
}
.m-row:last-child { border-bottom: none; }
.m-row b { color: var(--ink); font-weight: 600; }
.learn-strip {
  margin-top: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px;
  padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px;
}
.learn-strip b { color: #0369a1; display: block; }
.learn-strip span { color: #0284c7; font-size: 13px; }
.loading-page { display: flex; flex-direction: column; gap: 16px; }
.sk { background: linear-gradient(90deg, #f4f4f5 25%, #fafafa 50%, #f4f4f5 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 10px; }
.sk-title { width: 40%; height: 40px; }
.sk-chart { height: 520px; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (max-width: 1024px) {
  .sd-grid { grid-template-columns: 1fr; }
}
</style>
