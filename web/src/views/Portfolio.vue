<script setup>
// 持仓页 — 摘要+资产曲线(SVG)、持仓列表(T+1 角标)、历史成交、重置账户
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAccountStore } from '../stores/account.js';
import { useMarketStore } from '../stores/market.js';
import { api } from '../api.js';
import { fmtMoneyK, fmtNum, fmtPct, fmtTime, clsOf, boardName } from '../format.js';

const account = useAccountStore();
const market = useMarketStore();
const router = useRouter();

const trades = ref([]);
const snapshots = ref({});
const confirming = ref(false);
const confirmText = ref('');

onMounted(async () => {
  market.init();
  await account.refresh();
  try {
    const [t, r] = await Promise.all([api.getTrades(100), api.getReview()]);
    trades.value = t.trades || [];
    snapshots.value = r.snapshots || {};
  } catch {}
});

const marketValue = computed(() =>
  Math.round(account.positions.reduce((s, p) => s + (p.marketValue || 0), 0) * 100) / 100
);

// 资产曲线:snapshots 按日期升序;不足 2 点显示占位
const curve = computed(() => {
  const entries = Object.entries(snapshots.value).sort(([a], [b]) => (a < b ? -1 : 1));
  return entries;
});
const curvePath = computed(() => {
  if (curve.value.length < 2) return null;
  const vals = curve.value.map(([, v]) => v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 600;
  const H = 120;
  const pts = curve.value.map(([d, v], i) => {
    const x = (i / (curve.value.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 10) - 5;
    return [x, y, d, v];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  return { line, area, pts, up, first: vals[0], last: vals[vals.length - 1] };
});

async function doReset() {
  if (confirmText.value.trim() !== '重置') {
    alert('请输入"重置"二字确认');
    return;
  }
  await account.reset();
  confirming.value = false;
  confirmText.value = '';
  const t = await api.getTrades(100);
  trades.value = t.trades || [];
  const r = await api.getReview();
  snapshots.value = r.snapshots || {};
}
</script>

<template>
  <div class="page">
    <div v-if="!account.marketOk" class="degraded">⚠ 持仓现价暂时获取失败,市值与盈亏可能不是最新</div>

    <!-- 摘要四卡 + 曲线 -->
    <section class="sum-grid">
      <div class="card sum primary">
        <div class="sum-lab">总资产 (CNY)</div>
        <div class="sum-val num">{{ fmtMoneyK(account.totalAssets) }}</div>
        <div class="sum-sub num" :class="clsOf(account.totalPnl)">
          总盈亏 {{ account.totalPnl != null && account.totalPnl >= 0 ? '+' : '' }}{{ fmtNum(account.totalPnl) }}
        </div>
      </div>
      <div class="card sum">
        <div class="sum-lab">可用现金</div>
        <div class="sum-val num">{{ fmtMoneyK(account.cash) }}</div>
      </div>
      <div class="card sum">
        <div class="sum-lab">持仓市值</div>
        <div class="sum-val num">{{ fmtMoneyK(marketValue) }}</div>
      </div>
      <div class="card curve-card">
        <div class="sum-lab">资产曲线</div>
        <svg v-if="curvePath" class="curve" viewBox="0 0 600 120" preserveAspectRatio="none">
          <path :d="curvePath.area" :fill="curvePath.up ? 'rgba(214,69,69,0.10)' : 'rgba(30,122,90,0.10)'" />
          <path :d="curvePath.line" fill="none" :stroke="curvePath.up ? '#d64545' : '#1e7a5a'" stroke-width="1.8" />
        </svg>
        <div v-else class="curve-empty">有成交后开始记录每日快照(现在只有 {{ curve.length }} 个点)</div>
      </div>
    </section>

    <!-- 持仓列表 -->
    <section class="card block">
      <div class="block-head"><h3>当前持仓</h3><span class="num muted">{{ account.positions.length }} 只</span></div>
      <div v-if="!account.positions.length" class="empty">
        <p>还没有持仓,去行情页选一只股票试着买入第一笔吧</p>
        <button class="btn btn-primary" @click="router.push('/')">去看行情</button>
      </div>
      <table v-else class="table">
        <thead>
          <tr>
            <th class="tl">股票</th>
            <th class="tr">持仓 / 可用</th>
            <th class="tr">成本价(含费)</th>
            <th class="tr">现价</th>
            <th class="tr">市值</th>
            <th class="tr">浮动盈亏</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in account.positions" :key="p.symbol" @click="router.push('/stock/' + p.symbol)">
            <td class="tl">
              <div class="stock-name">{{ p.name }} <span class="chip">{{ boardName[p.board] }}</span></div>
              <div class="stock-code num">{{ p.symbol }}</div>
            </td>
            <td class="tr num">
              {{ p.totalQty }} / {{ p.availableQty }}
              <span v-if="p.lockedQty > 0" class="t1-badge">T+1 锁 {{ p.lockedQty }}</span>
            </td>
            <td class="tr num">{{ fmtNum(p.costPrice) }}</td>
            <td class="tr num" :class="clsOf(p.last - p.costPrice)">{{ fmtNum(p.last) }}</td>
            <td class="tr num">{{ fmtMoneyK(p.marketValue) }}</td>
            <td class="tr num" :class="clsOf(p.pnl)">
              {{ p.pnl != null && p.pnl >= 0 ? '+' : '' }}{{ fmtNum(p.pnl) }}
              <small v-if="p.pnlPct != null">({{ p.pnlPct >= 0 ? '+' : '' }}{{ fmtPct(p.pnlPct) }})</small>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 历史成交 -->
    <section class="card block">
      <div class="block-head"><h3>历史成交</h3><span class="num muted">{{ trades.length }} 笔</span></div>
      <div v-if="!trades.length" class="empty"><p>暂无成交记录</p></div>
      <table v-else class="table">
        <thead>
          <tr>
            <th class="tl">时间</th>
            <th class="tl">股票</th>
            <th class="tc">方向</th>
            <th class="tr">价格</th>
            <th class="tr">数量</th>
            <th class="tr">金额</th>
            <th class="tr">费用</th>
            <th class="tl">备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in trades" :key="t.id">
            <td class="tl num muted">{{ fmtTime(t.time) }}</td>
            <td class="tl">{{ t.name }}</td>
            <td class="tc"><span class="side" :class="t.side">{{ t.side === 'buy' ? '买入' : '卖出' }}</span></td>
            <td class="tr num">{{ fmtNum(t.price) }}</td>
            <td class="tr num">{{ t.qty }}</td>
            <td class="tr num">{{ fmtMoneyK(t.amount) }}</td>
            <td class="tr num muted">{{ fmtNum(t.fees.commission + t.fees.stampTax + t.fees.transferFee) }}</td>
            <td class="tl note">{{ t.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 重置 -->
    <section class="card block danger-zone">
      <div class="block-head">
        <h3>重置账户</h3>
        <button v-if="!confirming" class="btn btn-ghost" @click="confirming = true">重置为初始 10 万</button>
      </div>
      <div v-if="confirming" class="confirm-row">
        <span>⚠ 危险操作:清空全部持仓与流水,恢复初始资金 ¥100,000(自选保留)。输入"<b>重置</b>"确认:</span>
        <input v-model="confirmText" class="inp num" type="text" placeholder="重置" />
        <button class="btn btn-primary" @click="doReset">确认重置</button>
        <button class="btn btn-ghost" @click="(confirming = false), (confirmText = '')">取消</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.degraded {
  background: var(--amber-tint); border: 1px solid rgba(180,83,9,0.25); color: var(--notice);
  border-radius: 8px; padding: 8px 14px; font-size: 13px; margin-bottom: 16px;
}
.sum-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 2fr; gap: 16px; margin-bottom: 20px; }
.sum { padding: 16px 18px; }
.sum.primary { border-left: 3px solid var(--accent); }
.sum-lab { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.sum-val { font-size: 24px; font-weight: 700; }
.sum-sub { font-size: 13px; margin-top: 4px; }
.curve-card { padding: 16px 18px; display: flex; flex-direction: column; }
.curve { width: 100%; height: 64px; margin-top: 8px; }
.curve-empty { margin-top: 12px; font-size: 12px; color: var(--muted); }
.block { margin-bottom: 20px; }
.block-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.block-head h3 { font-size: 15px; }
.muted { color: var(--muted); font-size: 12px; }
.empty { padding: 40px; text-align: center; color: var(--muted); display: flex; flex-direction: column; gap: 12px; align-items: center; }
.table { width: 100%; border-collapse: collapse; }
.table th {
  font-size: 12px; color: var(--muted); font-weight: 500; letter-spacing: 0.05em;
  padding: 10px 18px; border-bottom: 1px solid var(--border); text-align: right;
}
.table th.tl { text-align: left; }
.table th.tc, .table td.tc { text-align: center; }
.table td { padding: 12px 18px; border-bottom: 1px solid var(--border); }
.table tbody tr:hover { background: #f4f4f5; }
.table tbody tr { cursor: default; }
#none { cursor: default; }
.stock-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.stock-code { font-size: 12px; color: var(--muted); }
.chip { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; font-weight: 400; }
.t1-badge {
  font-size: 11px; color: var(--notice); border: 1px solid rgba(180,83,9,0.3); border-radius: 4px; padding: 0 6px; margin-left: 4px;
}
.side { font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 4px; }
.side.buy { color: var(--up); background: var(--up-tint); }
.side.sell { color: var(--down); background: var(--down-tint); }
.note { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; }
.danger-zone { border-color: rgba(180, 83, 9, 0.3); }
.confirm-row { padding: 14px 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.inp { height: 38px; width: 120px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; }
@media (max-width: 1024px) {
  .sum-grid { grid-template-columns: 1fr 1fr; }
}
</style>
