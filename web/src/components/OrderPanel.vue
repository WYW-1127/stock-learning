<script setup>
// 下单面板 — 右侧抽屉:买卖切换、价格数量、快捷手数、费用预览、人话拒绝、成交回执
import { ref, computed, watch } from 'vue';
import { api } from '../api.js';
import { calcFeesPreview } from '../fees.js';
import { fmtMoney, fmtPct, clsOf } from '../format.js';
import TermPopover from './TermPopover.vue';

const props = defineProps({
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  quote: { type: Object, required: true }, // { last, limitUp, limitDown }
  position: { type: Object, default: null }, // 账户持仓行(可空)
  cash: { type: Number, default: null },
  mode: { type: String, default: 'live' },
  initialSide: { type: String, default: 'buy' }, // 从"卖出"按钮进入时直接开卖出页
});
const emit = defineEmits(['close', 'done']);

const side = ref(props.initialSide === 'sell' ? 'sell' : 'buy');
const price = ref('');
const qty = ref('');
const note = ref('');
const submitting = ref(false);
const reject = ref(null); // 人话拒绝原因
const receipt = ref(null); // 成交回执

watch(
  () => props.quote?.last,
  (v) => {
    if (v != null && !price.value) price.value = String(v);
  },
  { immediate: true }
);
watch(side, () => {
  reject.value = null;
});

const p = computed(() => Number.parseFloat(price.value));
const n = computed(() => Number.parseInt(qty.value, 10));
const amount = computed(() =>
  Number.isFinite(p.value) && Number.isFinite(n.value) && n.value > 0
    ? Math.round(p.value * n.value * 100) / 100
    : 0
);
const fees = computed(() => calcFeesPreview(side.value, amount.value));
const need = computed(() =>
  side.value === 'buy'
    ? Math.round((amount.value + fees.value.total) * 100) / 100
    : Math.round((amount.value - fees.value.total) * 100) / 100
);

// 前端轻校验(拦截明显错误;完整规则由服务端最终裁决)
const localError = computed(() => {
  if (!Number.isFinite(p.value) || p.value <= 0) return null; // 空值不报,提交时服务端挡
  if (props.quote?.limitUp != null && p.value > props.quote.limitUp) {
    return `委托价超出今日涨停价 ${props.quote.limitUp},请调整价格`;
  }
  if (props.quote?.limitDown != null && p.value < props.quote.limitDown) {
    return `委托价低于今日跌停价 ${props.quote.limitDown},请调整价格`;
  }
  if (side.value === 'buy' && Number.isFinite(n.value) && n.value > 0 && props.cash != null) {
    if (need.value > props.cash) {
      return `现金不足:合计需 ${fmtMoney(need.value)},可用 ${fmtMoney(props.cash)}。试试更少的数量。`;
    }
  }
  if (side.value === 'sell' && Number.isFinite(n.value) && n.value > 0 && props.position) {
    if (n.value > (props.position.availableQty ?? 0)) {
      return `卖出数量超过今日可用:持有 ${props.position.totalQty} 股,今日可用 ${props.position.availableQty} 股(T+1 规则)`;
    }
  }
  return null;
});

function setQty(v) { qty.value = String(v); }
function quickHand(hands) {
  setQty(hands * 100);
}
function quickPct(ratio) {
  if (side.value === 'buy' && props.quote?.last && props.cash != null) {
    const budget = props.cash * ratio;
    const per = props.quote.last * (1 + fees.value.commission / (amount.value || 1) + 0.00001);
    const shares = Math.floor(budget / per / 100) * 100;
    setQty(Math.max(shares, 0));
  } else if (side.value === 'sell' && props.position) {
    setQty(Math.max(Math.floor((props.position.availableQty * ratio) / 100) * 100, 0));
  }
}

async function submit() {
  reject.value = null;
  receipt.value = null;
  if (!Number.isFinite(p.value) || !Number.isFinite(n.value) || n.value <= 0) {
    reject.value = '请输入有效的价格和数量';
    return;
  }
  submitting.value = true;
  try {
    const r = await api.placeOrder({
      symbol: props.symbol,
      side: side.value,
      price: p.value,
      qty: n.value,
      note: note.value || null,
    });
    if (r.ok) {
      receipt.value = r.trade;
      qty.value = '';
      note.value = '';
      emit('done', r.trade);
    } else {
      reject.value = r.reason;
    }
  } catch {
    reject.value = '网络异常,请稍后再试(资金与持仓未受影响)';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <aside class="drawer">
      <header class="drawer-head">
        <div>
          <h2 :class="side === 'buy' ? 't-up' : 't-down'">
            {{ side === 'buy' ? '买入' : '卖出' }} {{ name }}
          </h2>
          <span class="code num">{{ symbol }}</span>
        </div>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="ctx">
        <span>当前价 <b class="num">{{ quote.last ?? '--' }}</b></span>
        <span class="dot"></span>
        <span v-if="side === 'buy'">可用资金 <b class="num">{{ fmtMoney(cash) }}</b></span>
        <span v-else>今日可卖 <b class="num">{{ position?.availableQty ?? 0 }} 股</b></span>
        <span v-if="mode === 'afterHours'" class="mode-badge">盘后模式 · 按 {{ quote.last ?? '收盘价' }} 撮合</span>
      </div>

      <div class="drawer-body">
        <div class="tabs">
          <button :class="{ on: side === 'buy', tab: true, buy: true }" @click="side = 'buy'">买入</button>
          <button :class="{ on: side === 'sell', tab: true, sell: true }" @click="side = 'sell'">卖出</button>
        </div>

        <div class="field">
          <label class="lab">委托价格(元)</label>
          <input v-model="price" class="inp num" type="text" inputmode="decimal" />
          <div class="hint num">
            <span>涨停 <span class="up">{{ quote.limitUp ?? '--' }}</span></span>
            <span>跌停 <span class="down">{{ quote.limitDown ?? '--' }}</span></span>
          </div>
        </div>

        <div class="field">
          <label class="lab">数量(股)</label>
          <input v-model="qty" class="inp num" type="text" inputmode="numeric" />
          <div class="hint">
            <span>1 手 = <TermPopover word="手" /> = 100 股</span>
          </div>
          <div class="quicks">
            <button class="quick" @click="quickHand(1)">1手</button>
            <button class="quick" @click="quickHand(5)">5手</button>
            <button class="quick" @click="quickPct(0.5)">半仓</button>
            <button class="quick" @click="quickPct(1)">全仓</button>
          </div>
        </div>

        <div class="field">
          <label class="lab">备注(选填,复盘时展示)</label>
          <input v-model="note" class="inp" type="text" maxlength="100" placeholder="例如:看好白酒板块回调企稳" />
        </div>

        <div class="fees">
          <div class="row"><span>成交金额</span><b class="num">{{ fmtMoney(amount) }}</b></div>
          <div class="row">
            <span><TermPopover word="佣金" />(最低 ¥5)</span>
            <b class="num">{{ fmtMoney(fees.commission) }}</b>
          </div>
          <div class="row" v-if="side === 'sell'">
            <span><TermPopover word="印花税" />(仅卖出)</span>
            <b class="num">{{ fmtMoney(fees.stampTax) }}</b>
          </div>
          <div class="row">
            <span><TermPopover word="过户费" /></span>
            <b class="num">{{ fmtMoney(fees.transferFee) }}</b>
          </div>
          <div class="row total">
            <span>{{ side === 'buy' ? '合计扣款' : '预计净得' }}</span>
            <b class="num" :class="side === 'buy' ? 'up' : 'down'">{{ fmtMoney(need) }}</b>
          </div>
        </div>
      </div>

      <footer class="drawer-foot">
        <div v-if="localError" class="warn">⚠ {{ localError }}</div>
        <div v-else-if="reject" class="warn">⚠ {{ reject }}</div>
        <button
          class="btn confirm"
          :class="side === 'buy' ? 'btn-buy' : 'btn-sell'"
          :disabled="submitting || !!localError"
          @click="submit"
        >
          {{ submitting ? '提交中…' : side === 'buy' ? '确认买入' : '确认卖出' }}
        </button>
      </footer>

      <!-- 成交回执 -->
      <div v-if="receipt" class="scrim inner" @click.self="null">
        <div class="receipt">
          <div class="r-title">{{ receipt.side === 'buy' ? '✓ 买入成交' : '✓ 卖出成交' }}</div>
          <div class="r-stock">{{ name }} <span class="num">{{ symbol }}</span></div>
          <div class="r-grid num">
            <div><i>成交价</i><b>{{ receipt.price }}</b></div>
            <div><i>数量</i><b>{{ receipt.qty }} 股</b></div>
            <div><i>成交额</i><b>{{ fmtMoney(receipt.amount) }}</b></div>
            <div><i>佣金</i><b>{{ fmtMoney(receipt.fees.commission) }}</b></div>
            <div v-if="receipt.side === 'sell'"><i>印花税</i><b>{{ fmtMoney(receipt.fees.stampTax) }}</b></div>
            <div><i>过户费</i><b>{{ fmtMoney(receipt.fees.transferFee) }}</b></div>
          </div>
          <div v-if="receipt.side === 'sell'" class="r-pnl" :class="clsOf(receipt.realizedPnl)">
            实现盈亏 {{ receipt.realizedPnl >= 0 ? '+' : '' }}{{ fmtMoney(receipt.realizedPnl).slice(1) }}
            <span v-if="receipt.closeLots?.lots?.length">
              (FIFO:买入于 {{ receipt.closeLots.lots.map(l => `${l.date} × ${l.qty}股`).join('、') }})
            </span>
          </div>
          <button class="btn btn-ghost" @click="receipt = null">继续交易</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(24, 24, 27, 0.4);
  display: flex; justify-content: flex-end;
}
.drawer {
  width: min(460px, 100vw); height: 100%;
  background: var(--surface); border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
}
.drawer-head {
  padding: 20px 24px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.drawer-head h2 { font-size: 18px; }
.t-up { color: var(--up); } .t-down { color: var(--down); }
.code { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; margin-left: 8px; }
.close { background: none; border: none; font-size: 16px; color: var(--muted); cursor: pointer; padding: 8px; }
.ctx {
  padding: 10px 24px; background: #f4f4f5; border-bottom: 1px solid var(--border);
  font-size: 13px; color: var(--muted);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.ctx b { color: var(--ink); }
.dot { width: 3px; height: 3px; border-radius: 50%; background: var(--muted); }
.mode-badge { color: var(--notice); background: var(--amber-tint); border: 1px solid rgba(180,83,9,0.25); border-radius: 4px; padding: 0 6px; font-size: 12px; }
.drawer-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 18px; }
.tabs { display: flex; border: 1px solid var(--border); border-radius: 8px; background: var(--canvas); padding: 3px; gap: 3px; }
.tab { flex: 1; min-height: 38px; border: none; background: none; border-radius: 6px; cursor: pointer; color: var(--muted); font-size: 14px; }
.tab.buy.on { background: var(--surface); color: var(--up); font-weight: 700; box-shadow: 0 1px 3px rgba(24,24,27,0.12); }
.tab.sell.on { background: var(--surface); color: var(--down); font-weight: 700; box-shadow: 0 1px 3px rgba(24,24,27,0.12); }
.field { display: flex; flex-direction: column; gap: 6px; }
.lab { font-size: 12px; letter-spacing: 0.05em; color: var(--muted); }
.inp {
  height: 44px; border: 1px solid var(--border); border-radius: 8px;
  padding: 0 12px; font-size: 15px; background: var(--surface);
}
.inp:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.hint { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
.quicks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 4px; }
.quick {
  height: 32px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
  color: var(--muted); font-size: 13px; cursor: pointer;
}
.quick:hover { background: #f4f4f5; color: var(--ink); }
.fees { background: #f4f4f5; border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--muted); }
.row b { color: var(--ink); font-weight: 600; }
.row.total { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; font-size: 14px; }
.row.total span { color: var(--ink); font-weight: 700; }
.drawer-foot { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.warn {
  background: var(--amber-tint); border: 1px solid rgba(180,83,9,0.25); border-radius: 8px;
  color: var(--notice); font-size: 13px; padding: 10px 12px; line-height: 1.5;
}
.confirm { width: 100%; min-height: 48px; font-size: 16px; font-weight: 700; }
.inner { position: absolute; inset: 0; align-items: center; justify-content: center; background: rgba(24,24,27,0.5); }
.receipt {
  width: min(400px, 90%); background: var(--surface); border-radius: 12px; padding: 24px;
  display: flex; flex-direction: column; gap: 14px; text-align: left;
}
.r-title { font-size: 17px; font-weight: 700; }
.r-stock { color: var(--muted); font-size: 13px; }
.r-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; font-size: 14px; }
.r-grid i { font-style: normal; display: block; font-size: 12px; color: var(--muted); }
.r-grid b { font-weight: 600; }
.r-pnl { font-size: 15px; font-weight: 700; }
.r-pnl span { font-weight: 400; font-size: 12px; color: var(--muted); }
</style>
