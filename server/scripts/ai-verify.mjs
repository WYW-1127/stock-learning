// AI Agent 真机验收 S1–S7 — UTF-8 请求,间隔 11s 避开节流;打印核对要点
// 用法:先以已配置 key 的服务跑在 8090,然后 node scripts/ai-verify.mjs
const BASE = 'http://localhost:8090';
const CASES = [
  ['S1', '分析一下平安银行'],
  ['S2', '我买了平安银行,现在能卖吗?'],
  ['S3', '我买的平安银行现在赚了多少?'],
  ['S4', '现在适合买入比亚迪吗?'],
  ['S5', '我已经有平安银行了,还能加仓吗?'],
  ['S6', '我现在持有的股票哪些风险比较大?'],
  ['S7', '我手里的股票要不要卖?'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;

for (const [id, msg] of CASES) {
  const t0 = Date.now();
  let out;
  try {
    const res = await fetch(`${BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const r = await res.json();
    if (!r.ok) {
      out = `FAIL ${r.reason}`;
      fail++;
    } else {
      const p = r.reply;
      out = [
        `intent=${p.intent} decision=${p.decision} conf=${p.confidence} tools=${r.toolCalls}`,
        `stance: ${p.stanceText}`,
        `facts: ${JSON.stringify(p.facts).slice(0, 260)}`,
        `sugg: ${p.suggestion.slice(0, 120)}`,
      ].join('\n      ');
      if (p.intent === 'fallback') fail++;
    }
  } catch (e) {
    out = `ERROR ${e.message}`;
    fail++;
  }
  console.log(`[${id}] ${msg}  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n      ${out}\n`);
  if (id !== 'S7') await sleep(11000); // 服务端 10s 节流
}
console.log(fail === 0 ? '=== 全部通过 ===' : `=== ${fail} 个场景异常 ===`);
process.exit(fail === 0 ? 0 : 1);
