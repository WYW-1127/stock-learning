<script setup>
// K线图 — klinecharts v10 封装:分时(面积+均价线)/ 日K / 周K(蜡烛+MA+成交量)
// v10 数据通过 setDataLoader 提供;setSymbol/setPeriod 切换触发重载;左滑自动加载更长历史
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { init, registerIndicator } from 'klinecharts';
import { api } from '../api.js';

const props = defineProps({
  symbol: { type: String, required: true },
  klt: { type: String, default: 'day' }, // minute | day | week
  limit: { type: Number, default: 120 },
});
const emit = defineEmits(['error']);

const el = ref(null);
const loading = ref(true);
const failed = ref(false);
let chart = null;
let extended = false; // 是否已加载过更早历史(左滑一次拉满)
let loadToken = 0; // 防过期响应

// 自定义均价线指标:读数据项上的 avgPrice 扩展字段(分时用)
registerIndicator({
  name: 'AVG',
  shortName: '均价',
  calc: (dataList) => dataList.map((d) => ({ avg: d.avgPrice })),
  figures: [
    { key: 'avg', title: '均价: ', type: 'line', styles: () => ({ color: '#b45309', lineSize: 1 }) },
  ],
});

const UP = '#d64545';
const DOWN = '#1e7a5a';

async function fetchBars(symbol, klt, limit) {
  if (klt === 'minute') {
    const r = await api.getKline(symbol, 'minute');
    const day = r.timeline.date; // 'YYYYMMDD'
    return r.timeline.points.map((p) => ({
      timestamp: new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${p.time}:00`).getTime(),
      open: p.price, high: p.price, low: p.price, close: p.price,
      volume: p.volume, avgPrice: p.avgPrice,
    }));
  }
  const r = await api.getKline(symbol, klt, limit);
  return r.bars.map((b) => ({
    timestamp: new Date(`${b.date}T00:00:00`).getTime(),
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }));
}

function setupChart() {
  chart = init(el.value);
  chart.setStyles({
    grid: {
      horizontal: { show: true, color: 'rgba(24,24,27,0.06)' },
      vertical: { show: false },
    },
    candle: {
      bar: {
        upColor: UP, downColor: DOWN,
        upBorderColor: UP, downBorderColor: DOWN,
        upWickColor: UP, downWickColor: DOWN,
      },
      priceMark: { high: { show: false }, low: { show: false } },
      type: props.klt === 'minute' ? 'area' : 'candle_solid',
      area: {
        lineSize: 1.5, lineColor: '#1d4ed8', value: 'close',
        backgroundColor: [
          { offset: 0, color: 'rgba(29,78,216,0.12)' },
          { offset: 1, color: 'rgba(29,78,216,0)' },
        ],
      },
    },
    xAxis: { tickText: { color: '#71717a', size: 10 }, tickLine: { show: false } },
    yAxis: { tickText: { color: '#71717a', size: 10 }, tickLine: { show: false } },
    crosshair: {
      horizontal: { text: { backgroundColor: '#18181b' } },
      vertical: { text: { backgroundColor: '#18181b' } },
    },
    indicator: { bars: [{ upColor: UP, downColor: DOWN, noChangeColor: '#71717a' }] },
    separator: { size: 1, color: 'rgba(24,24,27,0.08)' },
  });
  chart.setDataLoader({
    getBars: async ({ type, callback }) => {
      const token = ++loadToken;
      loading.value = true;
      failed.value = false;
      try {
        let bars;
        if (type === 'backward' && extended) {
          callback([], false);
          return;
        }
        if (type === 'backward') {
          extended = true; // 左滑加载更早历史:一次拉满
          bars = await fetchBars(props.symbol, props.klt, Math.max(props.limit, 800));
        } else {
          extended = false;
          bars = await fetchBars(props.symbol, props.klt, props.limit);
        }
        if (token !== loadToken) return; // 已切走,丢弃过期响应
        callback(bars, false);
      } catch (e) {
        if (token !== loadToken) return;
        failed.value = true;
        emit('error', e);
        callback([], false);
      } finally {
        if (token === loadToken) loading.value = false;
      }
    },
  });
  applyIndicators();
  chart.setSymbol({ ticker: props.symbol, pricePrecision: 2, volumePrecision: 0 });
  chart.setPeriod({ type: props.klt, span: 1 });
}

// 按周期挂指标:日/周=MA 叠加主图+VOL 独立窗格;分时=均价线叠加+VOL
function applyIndicators() {
  chart.removeIndicator();
  if (props.klt === 'minute') {
    chart.createIndicator('AVG', true);
  } else {
    chart.createIndicator('MA', true);
  }
  chart.createIndicator('VOL');
}

function reload() {
  extended = false;
  applyIndicators();
  chart.setStyles({ candle: { type: props.klt === 'minute' ? 'area' : 'candle_solid' } });
  chart.setSymbol({ ticker: props.symbol, pricePrecision: 2, volumePrecision: 0 });
  chart.setPeriod({ type: props.klt, span: 1 });
}

onMounted(() => {
  setupChart();
  const ro = new ResizeObserver(() => chart && chart.resize());
  ro.observe(el.value);
  el.value._ro = ro;
});

watch(() => [props.symbol, props.klt], reload);

onBeforeUnmount(() => {
  el.value?._ro?.disconnect();
  if (chart) chart.destroy();
});

defineExpose({ reload });
</script>

<template>
  <div class="kline-box">
    <div ref="el" class="kline-el"></div>
    <div v-if="loading" class="kline-mask">加载中…</div>
    <div v-else-if="failed" class="kline-mask">
      <div>数据获取失败</div>
      <button class="btn btn-ghost btn-retry" @click="reload">重试</button>
    </div>
  </div>
</template>

<style scoped>
.kline-box { position: relative; width: 100%; height: 100%; }
.kline-el { width: 100%; height: 100%; }
.kline-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 13px;
  background: var(--canvas);
}
.btn-retry { min-height: 32px; padding: 0 16px; font-size: 13px; }
</style>
