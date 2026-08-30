<script setup>
// 新手引导 — 遮罩分步导览 6 步:行情→搜索→个股→下单→持仓→复盘学习
// 首次自动弹出(localStorage 标记),顶栏"新手引导"可重看
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

const STEPS = [
  {
    selector: '.topnav .brand',
    title: '欢迎来到模拟炒股学习室',
    text: '这里是虚拟盘:10 万初始资金、真实行情、完整 A 股规则,亏了也不心疼,先练出手感。点"下一步"跟我走一遍。',
    fallback: { top: 12, left: 24, width: 260, height: 44 },
  },
  {
    selector: '.searchbox',
    title: '① 找股票',
    text: '输入代码或名称(如 600519 或"茅台"),下拉点击进个股页,还能一键加自选。',
    fallback: { top: 120, left: 24, width: 420, height: 44 },
  },
  {
    selector: '.watchlist-card',
    title: '② 盯行情',
    text: '自选股列表每 5 秒自动刷新,红涨绿跌。空的时候,先从搜索加两只感兴趣的股票。',
    fallback: { top: 300, left: 24, width: 500, height: 200 },
  },
  {
    selector: '.order-entry',
    title: '③ 试着交易',
    text: '在个股页点"买入",费用预览、涨跌停、T+1 校验都会在提交前告诉你,拒绝原因都是人话。',
    fallback: { top: 200, left: 700, width: 200, height: 60 },
  },
  {
    selector: '.topnav a[href="/portfolio"]',
    title: '④ 看持仓',
    text: '这里看现金、市值、总资产和资产曲线,买入当天 T+1 锁定的股数会有角标。',
    fallback: { top: 12, left: 420, width: 80, height: 44 },
  },
  {
    selector: '.topnav a[href="/review"]',
    title: '⑤ 复盘与学习',
    text: '每笔卖出都会进复盘:胜率、平均持有天数、每笔盈亏和当时的备注;还有 6 篇新手课和术语词典。祝练习顺利!',
    fallback: { top: 12, left: 500, width: 120, height: 44 },
  },
];

const STORAGE_KEY = 'guide-tour-done';
const visible = ref(false);
const step = ref(0);
const box = ref(null); // 高亮框位置
const card = ref({ top: 100, left: 100 }); // 说明卡位置

const current = computed(() => STEPS[step.value]);
const progress = computed(() => `${step.value + 1} / ${STEPS.length}`);

function place() {
  const s = STEPS[step.value];
  const el = document.querySelector(s.selector);
  if (el && el.offsetParent !== null) {
    const r = el.getBoundingClientRect();
    box.value = { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
  } else {
    box.value = s.fallback;
  }
  // 卡片放高亮框下方,越界时翻到上方/左移
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let top = box.value.top + box.value.height + 14;
  if (top > vh - 210) top = Math.max(16, box.value.top - 210);
  let left = Math.max(16, Math.min(box.value.left, vw - 376));
  card.value = { top, left };
}

async function go(i) {
  step.value = Math.min(Math.max(i, 0), STEPS.length - 1);
  await nextTick();
  place();
}
function next() {
  if (step.value === STEPS.length - 1) finish();
  else go(step.value + 1);
}
function finish() {
  visible.value = false;
  localStorage.setItem(STORAGE_KEY, '1');
}
function start() {
  visible.value = true;
  go(0);
}

function onKey(e) {
  if (!visible.value) return;
  if (e.key === 'Escape') finish();
}

defineExpose({ start });

onMounted(() => {
  window.addEventListener('resize', () => visible.value && place());
  window.addEventListener('keydown', onKey);
  window.addEventListener('start-tour', start); // 各页"重新观看新手引导"入口
  if (!localStorage.getItem(STORAGE_KEY)) {
    setTimeout(start, 600); // 首次访问自动弹出
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('start-tour', start);
});
</script>

<template>
  <div v-if="visible" class="tour">
    <div
      class="tour-hole"
      :style="box ? { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` } : {}"
    ></div>
    <div class="tour-mask" @click="finish"></div>
    <div
      class="tour-card"
      :style="{ top: `${card.top}px`, left: `${card.left}px` }"
    >
      <div class="tour-step num">{{ progress }}</div>
      <div class="tour-title">{{ current.title }}</div>
      <div class="tour-text">{{ current.text }}</div>
      <div class="tour-actions">
        <button class="btn btn-ghost btn-tour" @click="finish">跳过</button>
        <div class="tour-nav">
          <button v-if="step > 0" class="btn btn-ghost btn-tour" @click="go(step - 1)">上一步</button>
          <button class="btn btn-primary btn-tour" @click="next">
            {{ step === STEPS.length - 1 ? '开始使用' : '下一步' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 200; }
.tour-mask { position: absolute; inset: 0; background: rgba(24, 24, 27, 0.5); }
.tour-hole {
  position: absolute;
  border-radius: 10px;
  box-shadow: 0 0 0 4000px rgba(24, 24, 27, 0.5);
  border: 2px solid var(--accent);
  pointer-events: none;
  z-index: 1;
  transition: top 0.25s, left 0.25s, width 0.25s, height 0.25s;
}
.tour-card {
  position: absolute;
  width: 360px;
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  z-index: 2;
  box-shadow: 0 12px 32px rgba(24, 24, 27, 0.25);
}
.tour-step { font-size: 12px; color: var(--accent); font-weight: 700; margin-bottom: 6px; }
.tour-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.tour-text { font-size: 13px; color: var(--muted); line-height: 1.7; margin-bottom: 14px; }
.tour-actions { display: flex; justify-content: space-between; align-items: center; }
.tour-nav { display: flex; gap: 8px; }
.btn-tour { min-height: 36px; padding: 0 14px; font-size: 13px; }
</style>
