<script setup>
// 复盘与学习页 — 左:胜率统计+平仓明细;右:课程+术语词典+引导重看
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';
import { useContentStore } from '../stores/content.js';
import { api } from '../api.js';
import { fmtMoneyK, fmtNum, fmtPct, fmtTime, clsOf } from '../format.js';

const content = useContentStore();
const summary = ref(null);
const closedTrades = ref([]);
const lesson = ref(null); // { id, title, markdown }
const termQuery = ref('');
const learned = ref(JSON.parse(localStorage.getItem('learned-lessons') || '[]'));

// 课程正文渲染:内容来自本仓库 content/lesssons(可信源),无需再做 HTML 消毒
const lessonHtml = computed(() =>
  lesson.value ? marked.parse(lesson.value.markdown, { breaks: true }) : ''
);

onMounted(async () => {
  content.ensureLessons();
  content.ensureTerms();
  try {
    const r = await api.getReview();
    summary.value = r.summary;
    closedTrades.value = r.closedTrades || [];
  } catch {}
});

const terms = computed(() => {
  const q = termQuery.value.trim();
  const all = content.terms;
  return q ? all.filter((t) => t.term.includes(q) || t.explain.includes(q)) : all;
});

async function openLesson(id) {
  try {
    const r = await api.getLesson(id);
    lesson.value = r;
  } catch {}
  if (!learned.value.includes(id)) {
    learned.value.push(id);
    localStorage.setItem('learned-lessons', JSON.stringify(learned.value));
  }
}
function backToList() {
  lesson.value = null;
}
function startTour() {
  window.dispatchEvent(new Event('start-tour'));
}
</script>

<template>
  <div class="page review-page">
    <!-- 左:复盘 -->
    <section class="rv-left">
      <!-- 统计卡 -->
      <div class="stat-grid" v-if="summary">
        <div class="card stat">
          <div class="lab">胜率</div>
          <div class="val num" :class="summary.winRate != null && summary.winRate >= 50 ? 'up' : 'down'">
            {{ summary.winRate != null ? fmtPct(summary.winRate) : '—' }}
          </div>
          <div class="sub">{{ summary.winCount }} 胜 / {{ summary.closedCount - summary.winCount }} 负 · 共 {{ summary.closedCount }} 笔</div>
        </div>
        <div class="card stat">
          <div class="lab">已实现盈亏</div>
          <div class="val num" :class="clsOf(summary.totalRealizedPnl)">
            {{ summary.totalRealizedPnl >= 0 ? '+' : '' }}{{ fmtNum(summary.totalRealizedPnl) }}
          </div>
          <div class="sub" v-if="summary.maxWin != null">最大单笔盈 +{{ fmtNum(summary.maxWin) }} / 亏 {{ fmtNum(summary.maxLoss) }}</div>
        </div>
        <div class="card stat">
          <div class="lab">平均持有天数</div>
          <div class="val num">{{ summary.avgHoldDays != null ? fmtNum(summary.avgHoldDays, 1) : '—' }}</div>
          <div class="sub">按卖出股数加权</div>
        </div>
      </div>

      <!-- 平仓明细 -->
      <div class="card block">
        <div class="block-head"><h3>交易记录复盘</h3><span class="muted">{{ closedTrades.length }} 笔平仓</span></div>
        <div v-if="!closedTrades.length" class="empty">
          <p>还没有平仓记录。买入后卖出,这里会展示每笔的盈亏、持有天数和当时写的备注——坚持记录理由,复盘才有价值。</p>
        </div>
        <table v-else class="table">
          <thead>
            <tr>
              <th class="tl">卖出时间</th>
              <th class="tl">股票</th>
              <th class="tr">天数</th>
              <th class="tl">买入理由(备注)</th>
              <th class="tr">盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in closedTrades" :key="t.id">
              <td class="tl num muted">{{ fmtTime(t.time) }}</td>
              <td class="tl">{{ t.name }}<div class="sub-code num">{{ t.symbol }}</div></td>
              <td class="tr num">{{ t.holdDays != null ? fmtNum(t.holdDays, 1) : '—' }}</td>
              <td class="tl note">{{ t.note || '(没写备注)' }}</td>
              <td class="tr num" :class="clsOf(t.realizedPnl)">
                {{ t.realizedPnl >= 0 ? '+' : '' }}{{ fmtNum(t.realizedPnl) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 右:学习 -->
    <section class="rv-right">
      <!-- 课程 -->
      <div class="card block">
        <div class="block-head"><h3>新手课程</h3><span class="muted">已学 {{ learned.length }} / {{ content.lessons.length }}</span></div>
        <div v-if="lesson" class="lesson-view">
          <button class="btn btn-ghost btn-back" @click="backToList">← 返回列表</button>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="lesson-md" v-html="lessonHtml"></div>
        </div>
        <ul v-else class="lesson-list">
          <li v-for="l in content.lessons" :key="l.id" :class="{ done: learned.includes(l.id) }" @click="openLesson(l.id)">
            <span class="lesson-title">{{ l.title }}</span>
            <span class="lesson-state">{{ learned.includes(l.id) ? '✓ 已读' : '阅读' }}</span>
          </li>
        </ul>
      </div>

      <!-- 术语词典 -->
      <div class="card block">
        <div class="block-head"><h3>术语辞典</h3><span class="muted">{{ content.terms.length }} 条</span></div>
        <div class="term-search">
          <input v-model="termQuery" type="text" placeholder="搜索术语,如 T+1 / 涨跌停" />
        </div>
        <div class="term-list">
          <details v-for="t in terms" :key="t.id" class="term-item">
            <summary>{{ t.term }}</summary>
            <p>{{ t.explain }}</p>
          </details>
          <div v-if="!terms.length" class="empty small">没有匹配的术语</div>
        </div>
      </div>

      <!-- 引导重看 -->
      <div class="card block guide-entry">
        <span>第一次没看明白?再走一遍 6 步导览。</span>
        <button class="btn btn-ghost" @click="startTour">重新观看新手引导</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.review-page { display: grid; grid-template-columns: 58fr 42fr; gap: 20px; align-items: start; }
.rv-left, .rv-right { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat { padding: 14px 16px; }
.stat .lab { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.stat .val { font-size: 22px; font-weight: 700; }
.stat .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.block-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.block-head h3 { font-size: 15px; }
.muted { color: var(--muted); font-size: 12px; }
.empty { padding: 32px 24px; text-align: center; color: var(--muted); font-size: 13px; }
.empty.small { padding: 16px; }
.table { width: 100%; border-collapse: collapse; }
.table th {
  font-size: 12px; color: var(--muted); font-weight: 500; letter-spacing: 0.05em;
  padding: 10px 18px; border-bottom: 1px solid var(--border); text-align: right;
}
.table th.tl { text-align: left; }
.table td { padding: 12px 18px; border-bottom: 1px solid var(--border); }
.table tbody tr:hover { background: #f4f4f5; }
.sub-code { font-size: 11px; color: var(--muted); }
.note { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; }
.lesson-list { list-style: none; }
.lesson-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 18px; border-bottom: 1px solid var(--border); cursor: pointer;
}
.lesson-list li:last-child { border-bottom: none; }
.lesson-list li:hover { background: #f4f4f5; }
.lesson-title { font-size: 14px; }
.lesson-state { font-size: 12px; color: var(--muted); }
.lesson-list li.done .lesson-state { color: var(--down); }
.lesson-view { padding: 16px 20px; }
.btn-back { min-height: 32px; font-size: 13px; margin-bottom: 12px; }
/* 课程正文排版:marked 渲染后的富文本 */
.lesson-md { font-size: 14px; line-height: 1.9; color: var(--ink); }
.lesson-md :deep(h1) {
  font-size: 19px; font-weight: 700; margin: 8px 0 16px; padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.lesson-md :deep(h2) {
  font-size: 16px; font-weight: 700; margin: 26px 0 10px;
  padding-left: 10px; border-left: 3px solid var(--accent);
}
.lesson-md :deep(h3) { font-size: 14.5px; font-weight: 700; margin: 18px 0 8px; }
.lesson-md :deep(p) { margin: 10px 0; }
.lesson-md :deep(ul), .lesson-md :deep(ol) { padding-left: 22px; margin: 10px 0; }
.lesson-md :deep(li) { margin: 5px 0; }
.lesson-md :deep(b), .lesson-md :deep(strong) { font-weight: 700; }
.lesson-md :deep(table) { border-collapse: collapse; margin: 14px 0; width: 100%; font-size: 13px; }
.lesson-md :deep(th) {
  background: #f4f4f5; color: var(--muted); font-weight: 600; letter-spacing: 0.03em;
  padding: 8px 12px; border: 1px solid var(--border); text-align: left;
}
.lesson-md :deep(td) { padding: 8px 12px; border: 1px solid var(--border); }
.lesson-md :deep(blockquote) {
  margin: 14px 0; padding: 10px 14px; background: var(--amber-tint);
  border-left: 3px solid var(--notice); border-radius: 0 8px 8px 0;
  color: var(--ink);
}
.lesson-md :deep(blockquote p) { margin: 4px 0; }
.lesson-md :deep(code) {
  font-family: var(--font-mono); font-size: 12.5px; background: #f4f4f5;
  border-radius: 4px; padding: 1px 5px;
}
.lesson-md :deep(hr) { border: none; border-top: 1px dashed var(--border); margin: 20px 0; }
.lesson-md :deep(em) { color: var(--muted); }
.term-search { padding: 12px 18px 0; }
.term-search input {
  width: 100%; height: 40px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px;
}
.term-search input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.term-list { max-height: 400px; overflow-y: auto; padding: 8px 6px; }
.term-item summary {
  padding: 8px 12px; cursor: pointer; font-size: 13px; font-weight: 600; border-radius: 6px;
  list-style: none; display: flex; align-items: center; gap: 6px;
}
.term-item summary::before { content: '▸'; color: var(--muted); font-size: 10px; }
.term-item[open] summary::before { content: '▾'; }
.term-item summary:hover { background: #f4f4f5; }
.term-item p { padding: 2px 12px 10px 26px; font-size: 13px; color: var(--muted); line-height: 1.7; }
.guide-entry {
  padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; color: var(--muted);
}
@media (max-width: 1024px) {
  .review-page { grid-template-columns: 1fr; }
}
</style>
