<script setup>
// AI Investment Agent — 全局浮动入口 + 聊天抽屉:自然语言提问,Agent 自主查数据后给结构化分析卡
// 监听 window 'ai-ask' 事件(detail.message)供个股页快捷入口预填发送
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const open = ref(false);
const input = ref('');
const sending = ref(false);
const messages = ref([]); // {role:'user'|'assistant', text, reply?, streaming?, reasoning?, tools?, thinkOpen?, thinkSecs?}
const status = ref({ configured: true, configPath: '', model: null });
const listEl = ref(null);

const CONF_LABEL = { high: '高', medium: '中', low: '低' };
const DECISION_LABEL = {
  buy: '可考虑买入', sell: '可考虑卖出', split_sell: '可考虑分批卖出',
  hold: '偏向持有', watch: '建议观望', none: '—',
};
// 工具名 → 人话(展示给新手看)
const TOOL_LABEL = {
  search_stock: '搜索股票', get_account: '查账户总览', get_position: '查持仓',
  get_trade_history: '查成交流水', get_stock_quote: '查实时行情', get_stock_kline: '查K线',
  calculate_indicators: '算技术指标', get_market_context: '查大盘环境',
  get_portfolio_risk_snapshot: '查持仓风险快照',
};
const toolDetail = (args) => args?.keyword || args?.symbol || '';

let scrollPending = false;
function scrollBottom() {
  if (scrollPending) return;
  scrollPending = true;
  nextTick(() => {
    scrollPending = false;
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  });
}

async function loadStatus() {
  try {
    const r = await api.aiStatus();
    status.value = r;
  } catch {}
}

function toggle() {
  open.value = !open.value;
  if (open.value) {
    loadStatus();
    scrollBottom();
  }
}

async function send(preset) {
  const text = (preset || input.value).trim();
  if (!text || sending.value) return;
  input.value = '';
  messages.value.push({ role: 'user', text });
  sending.value = true;
  scrollBottom();
  // 占位消息:思考过程/工具进度流式填充,answer 到达后替换为结构化卡片
  messages.value.push({
    role: 'assistant', streaming: true, reasoning: '', thinkOpen: true,
    thinkSecs: 0, tools: [], reply: null, text: '', error: false,
  });
  const slot = messages.value[messages.value.length - 1]; // 取代理引用,保证响应式
  const timer = setInterval(() => slot.thinkSecs++, 1000);
  try {
    await api.aiChatStream(text, (ev) => {
      if (ev.type === 'reasoning') {
        slot.reasoning += ev.text;
        scrollBottom();
      } else if (ev.type === 'tool') {
        slot.tools.push({
          name: ev.name, label: TOOL_LABEL[ev.name] || ev.name,
          detail: toolDetail(ev.args), ok: null,
        });
      } else if (ev.type === 'tool_done') {
        const t = [...slot.tools].reverse().find((x) => x.name === ev.name && x.ok === null);
        if (t) t.ok = ev.ok;
      } else if (ev.type === 'answer') {
        slot.reply = ev.reply;
        slot.streaming = false;
        slot.thinkOpen = false; // 出答案后收起思考过程,可手动展开回看
      } else if (ev.type === 'error') {
        slot.text = ev.reason || 'AI 暂不可用';
        slot.error = true;
        slot.streaming = false;
      }
    });
    if (slot.streaming) {
      // 流结束却没收到 answer/error(服务异常中断)
      slot.text = '连接中断,请重试。';
      slot.error = true;
      slot.streaming = false;
    }
  } catch {
    slot.text = '网络异常,请稍后再试。';
    slot.error = true;
    slot.streaming = false;
  } finally {
    clearInterval(timer);
    sending.value = false;
    scrollBottom();
  }
}

async function clearChat() {
  if (!confirm('清空全部对话记录?')) return;
  await api.aiClear().catch(() => {});
  messages.value = [];
}

function goOrder(reply) {
  open.value = false;
  const side = reply.decision === 'sell' || reply.decision === 'split_sell' ? 'sell' : 'buy';
  router.push({ path: `/stock/${reply.symbol}`, query: { side, ai: '1' } });
}

// 个股页「问 AI」快捷入口
function onAsk(e) {
  open.value = true;
  loadStatus();
  if (e.detail?.message) send(e.detail.message);
}
onMounted(() => {
  window.addEventListener('ai-ask', onAsk);
  loadStatus();
});
onBeforeUnmount(() => window.removeEventListener('ai-ask', onAsk));
</script>

<template>
  <!-- 浮动按钮 -->
  <button v-if="!open" class="fab" @click="toggle" title="AI Investment Agent">
    <span class="fab-icon">🤖</span>
    <span class="fab-label">AI Investment Agent</span>
  </button>

  <!-- 聊天抽屉 -->
  <div v-if="open" class="scrim" @click.self="toggle">
    <aside class="chat-drawer">
      <header class="chat-head">
        <div>
          <h3>AI Investment Agent</h3>
          <span class="chat-sub">{{ status.configured ? `模型 ${status.model} · 自主查询你的行情与持仓` : '未配置' }}</span>
        </div>
        <div class="chat-ops">
          <button v-if="messages.length" class="op" @click="clearChat">清空</button>
          <button class="op" @click="toggle">✕</button>
        </div>
      </header>

      <!-- 未配置指引 -->
      <div v-if="!status.configured" class="setup">
        <p>AI Investment Agent 还没配置。两步启用:</p>
        <ol>
          <li>到 <a href="https://bigmodel.cn" target="_blank" rel="noopener">bigmodel.cn</a> 注册并创建 API Key(有免费额度)</li>
          <li>在本机创建文件 <code>{{ status.configPath }}</code>,内容:
            <pre>{
  "apiKey": "你的Key",
  "model": "glm-5.3-flash"
}</pre>
            保存后重启服务即可。
          </li>
        </ol>
        <p class="setup-note">Key 只存在你电脑上,不会进入项目仓库。</p>
      </div>

      <div v-else ref="listEl" class="chat-list">
        <div v-if="!messages.length" class="welcome">
          <div class="welcome-title">👋 我是你的 AI Investment Agent</div>
          <p>直接用大白话问我,我会自己去查你的持仓、实时行情、技术指标和基本面再回答:</p>
          <div class="chips">
            <button class="chip-q" @click="send('分析一下平安银行')">分析一下平安银行</button>
            <button class="chip-q" @click="send('我买的股票现在能卖吗?')">我买的股票现在能卖吗?</button>
            <button class="chip-q" @click="send('我持有的股票哪些风险比较大?')">持仓哪些风险大?</button>
            <button class="chip-q" @click="send('现在适合买入比亚迪吗?')">现在适合买入比亚迪吗?</button>
          </div>
        </div>

        <template v-for="(m, i) in messages" :key="i">
          <div v-if="m.role === 'user'" class="msg user">{{ m.text }}</div>
          <div v-else class="msg ai">
            <!-- 思考过程(流式,可折叠) -->
            <div v-if="m.reasoning || m.tools?.length" class="ai-think">
              <button class="think-toggle" @click="m.thinkOpen = !m.thinkOpen">
                <span>💭 {{ m.streaming && !m.reply ? `思考中 · ${m.thinkSecs}s` : `思考过程 · ${m.thinkSecs}s` }}</span>
                <span>{{ m.thinkOpen ? '▾' : '▸' }}</span>
              </button>
              <div v-show="m.thinkOpen" class="think-body">
                <div v-for="(t, ti) in m.tools" :key="ti" class="tool-line">
                  🔍 {{ t.label }}<template v-if="t.detail">({{ t.detail }})</template>
                  <span class="tool-st" :class="{ fail: t.ok === false }">{{ t.ok === null ? '…' : t.ok ? '✓' : '✗' }}</span>
                </div>
                <div class="think-text">{{ m.reasoning }}<span v-if="m.streaming && !m.reply" class="caret">▍</span></div>
              </div>
            </div>
            <!-- 结构化卡片(fallback/error 退化为纯文本) -->
            <template v-if="m.reply && !m.error">
              <div class="ai-head">
                <span class="decision" :class="m.reply.decision">{{ DECISION_LABEL[m.reply.decision] || m.reply.decision }}</span>
                <span class="conf">置信度 {{ CONF_LABEL[m.reply.confidence] || m.reply.confidence }}</span>
              </div>
              <div class="ai-stance">{{ m.reply.stanceText }}</div>
              <div v-if="Object.keys(m.reply.facts || {}).length" class="ai-facts">
                <div v-for="(v, k) in m.reply.facts" :key="k" class="fact"><i>{{ k }}</i><b>{{ v }}</b></div>
              </div>
              <ul v-if="m.reply.reasons?.length" class="ai-list reasons">
                <li v-for="(r, j) in m.reply.reasons" :key="j">{{ r }}</li>
              </ul>
              <ul v-if="m.reply.risks?.length" class="ai-list risks">
                <li v-for="(r, j) in m.reply.risks" :key="j">{{ r }}</li>
              </ul>
              <ul v-if="m.reply.coachQuestions?.length" class="ai-list coach">
                <li v-for="(q, j) in m.reply.coachQuestions" :key="j">💡 {{ q }}</li>
              </ul>
              <div class="ai-suggestion">{{ m.reply.suggestion }}</div>
              <button
                v-if="m.reply.symbol && ['buy', 'sell', 'split_sell'].includes(m.reply.decision)"
                class="btn btn-ghost btn-go"
                @click="goOrder(m.reply)"
              >去模拟{{ m.reply.decision === 'sell' || m.reply.decision === 'split_sell' ? '卖出' : '买入' }} →</button>
            </template>
            <div v-else-if="m.text" :class="{ 'ai-err': m.error }">{{ m.text }}</div>
            <div v-if="!m.streaming && (m.reply || m.text)" class="ai-disclaimer">AI 仅供学习参考,不构成投资建议</div>
          </div>
        </template>
      </div>

      <footer v-if="status.configured" class="chat-foot">
        <input
          v-model="input"
          type="text"
          placeholder="问点什么,如:我买的平安银行现在能卖吗?"
          :disabled="sending"
          @keydown.enter="send()"
        />
        <button class="btn btn-primary btn-send" :disabled="sending || !input.trim()" @click="send()">发送</button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.fab {
  position: fixed; right: 24px; bottom: 88px; z-index: 90;
  display: flex; align-items: center; gap: 8px;
  background: var(--accent); color: #fff; border: none; border-radius: 24px;
  padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
  box-shadow: 0 6px 20px rgba(194, 64, 42, 0.35);
  transition: transform 0.15s;
}
.fab:hover { transform: translateY(-2px); }
.fab-icon { font-size: 16px; }
.scrim { position: fixed; inset: 0; z-index: 95; background: rgba(24, 24, 27, 0.35); display: flex; justify-content: flex-end; }
.chat-drawer {
  width: min(440px, 100vw); height: 100%; background: var(--canvas);
  border-left: 1px solid var(--border); display: flex; flex-direction: column;
}
.chat-head {
  padding: 16px 20px; background: var(--surface); border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.chat-head h3 { font-size: 16px; }
.chat-sub { font-size: 11px; color: var(--muted); }
.chat-ops { display: flex; gap: 6px; }
.op { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 13px; padding: 6px 8px; }
.op:hover { color: var(--ink); }
.setup { padding: 20px; font-size: 13px; line-height: 1.8; overflow-y: auto; }
.setup ol { padding-left: 18px; }
.setup code { font-family: var(--font-mono); background: #f4f4f5; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
.setup pre {
  font-family: var(--font-mono); font-size: 12px; background: #f4f4f5; border-radius: 8px;
  padding: 10px 12px; margin: 8px 0; overflow-x: auto;
}
.setup a { color: var(--accent); }
.setup-note { color: var(--muted); font-size: 12px; }
.chat-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.welcome { text-align: left; padding: 12px 6px; }
.welcome-title { font-weight: 700; margin-bottom: 6px; }
.welcome p { font-size: 13px; color: var(--muted); margin-bottom: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-q {
  border: 1px solid var(--border); background: var(--surface); border-radius: 16px;
  padding: 6px 12px; font-size: 12px; color: var(--ink); cursor: pointer;
}
.chip-q:hover { border-color: var(--accent); color: var(--accent); }
.msg { max-width: 92%; border-radius: 12px; padding: 10px 14px; font-size: 13.5px; line-height: 1.65; }
.msg.user { align-self: flex-end; background: var(--accent); color: #fff; white-space: pre-wrap; }
.msg.ai { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); }
.ai-err { color: var(--notice); }
.ai-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.decision { font-size: 12px; font-weight: 700; padding: 1px 10px; border-radius: 10px; background: var(--up-tint); color: var(--up); }
.decision.sell, .decision.split_sell { background: var(--down-tint); color: var(--down); }
.decision.hold, .decision.watch { background: var(--amber-tint); color: var(--notice); }
.decision.none, .decision.buy { background: var(--up-tint); color: var(--up); }
.conf { font-size: 11px; color: var(--muted); }
.ai-stance { font-weight: 700; margin-bottom: 8px; }
.ai-facts {
  display: flex; flex-direction: column; gap: 7px;
  background: #f7f7f8; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px;
}
.fact { display: flex; align-items: baseline; gap: 8px; }
.fact i { font-style: normal; color: var(--muted); flex: 0 0 auto; min-width: 4em; white-space: nowrap; }
.fact b { font-family: var(--font-mono); font-weight: 600; flex: 1; min-width: 0; line-height: 1.6; word-break: break-word; }
.ai-list { margin: 6px 0 6px 16px; font-size: 12.5px; color: var(--ink); }
.ai-list li { margin: 3px 0; }
.ai-list.risks li { color: var(--notice); }
.ai-list.coach li { color: var(--muted); }
.ai-suggestion { border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 6px; font-size: 13px; }
.btn-go { min-height: 32px; margin-top: 8px; font-size: 12px; }
.ai-disclaimer { font-size: 10px; color: var(--muted); margin-top: 8px; }
/* 思考过程折叠区 */
.ai-think { margin-bottom: 8px; border: 1px solid var(--border); border-radius: 8px; background: #fafafa; overflow: hidden; }
.think-toggle {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: none; border: none; padding: 6px 10px; font-size: 11px; color: var(--muted); cursor: pointer;
}
.think-toggle:hover { color: var(--ink); }
.think-body { padding: 2px 10px 8px; max-height: 200px; overflow-y: auto; border-top: 1px dashed var(--border); }
.tool-line { font-size: 11.5px; color: var(--ink); margin: 3px 0; }
.tool-st { color: #52c41a; margin-left: 4px; font-weight: 700; }
.tool-st.fail { color: #f5222d; }
.think-text {
  font-size: 11.5px; color: var(--muted); line-height: 1.7; margin-top: 4px;
  white-space: pre-wrap; word-break: break-word;
}
.caret { animation: blink 1s infinite; color: var(--accent); }
@keyframes blink { 50% { opacity: 0.2; } }
.chat-foot { padding: 12px 16px; background: var(--surface); border-top: 1px solid var(--border); display: flex; gap: 10px; }
.chat-foot input {
  flex: 1; height: 42px; border: 1px solid var(--border); border-radius: 10px;
  padding: 0 14px; font-size: 13px; background: var(--canvas);
}
.chat-foot input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.btn-send { min-height: 42px; padding: 0 18px; }
</style>
