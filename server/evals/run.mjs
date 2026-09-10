// 离线评估 runner — 真实 LLM + 真实工具,零侵入复用 runAgent 的 onEvent 事件流
// 用法:
//   node evals/run.mjs                    全量跑(增量写 reports/run-<时间戳>.jsonl)
//   node evals/run.mjs --only QA-001,GA-001 只跑指定用例(试跑/复验)
//   node evals/run.mjs --resume            接着最近一次未完成的 run-*.jsonl 继续跑
// 前置:~/.stock-learning/ai.json 已配置(或 ZHIPU_API_KEY 环境变量)
// 隔离:DATA_DIR 指向 evals/fixture(只读持仓/流水;每用例前清 chat.json 实现用例间隔离,
//       多轮用例内部不清以延续上下文);节流用 __resetThrottleForTest 复位(测试钩子复用)
// 注意:env 必须在动态 import agent/store 之前设好(模块加载时读 DATA_DIR)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixture');
process.env.DATA_DIR = FIXTURE_DIR;
const CHAT_FILE = path.join(FIXTURE_DIR, 'chat.json');
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const REPORT_DIR = path.join(__dirname, 'reports');

const argv = process.argv.slice(2);
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const resume = argv.includes('--resume');
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- onEvent 事件收集器:tool/tool_done 配对(并行执行下按名称顺序配对) ----
function createCollector() {
  const events = [];
  let maxRound = 0;
  return {
    onEvent: (ev) => {
      if (ev.type === 'tool') {
        events.push({ name: ev.name, args: ev.args, ok: null, done: false, argParseFail: ev.args?.error === '工具参数不是合法 JSON' });
      } else if (ev.type === 'tool_done') {
        const pending = events.find((e) => e.name === ev.name && !e.done);
        if (pending) { pending.done = true; pending.ok = ev.ok; }
      } else if (ev.type === 'reasoning' && ev.round > maxRound) {
        maxRound = ev.round;
      }
    },
    stats: () => ({
      toolNames: [...new Set(events.map((e) => e.name))],
      total: events.length,
      errors: events.filter((e) => e.ok === false).length,
      argParseFails: events.filter((e) => e.argParseFail).length,
      maxRound,
    }),
  };
}

function buildActual(r, stats, latencyMs) {
  const reply = r?.reply || {};
  return {
    ok: !!r?.ok,
    error: r?.reason || null,
    intent: reply.intent ?? null,
    decision: reply.decision ?? null,
    symbol: reply.symbol ?? null,
    toolCalls: r?.toolCalls ?? 0,
    toolNames: stats.toolNames,
    factsKeys: Object.keys(reply.facts || {}).length,
    replyText: JSON.stringify(reply),
    isFallback: reply.intent === 'fallback',
    intercepted: reply.intent === 'fallback' && /拦截/.test(reply.suggestion || ''),
    toolEvents: { total: stats.total, errors: stats.errors, argParseFails: stats.argParseFails },
    maxRound: stats.maxRound,
    latencyMs,
  };
}

// ---- 断点续跑:读取已有 jsonl,跳过已完成的 caseId(完整跑完所有 turn 才算完成) ----
function loadDoneCases(jsonlPath) {
  const done = new Map(); // caseId → 完成的 turn 数
  if (!fs.existsSync(jsonlPath)) return done;
  for (const line of fs.readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      done.set(row.caseId, (done.get(row.caseId) || 0) + 1);
    } catch {}
  }
  return done;
}

function latestRunFile() {
  if (!fs.existsSync(REPORT_DIR)) return null;
  const files = fs.readdirSync(REPORT_DIR).filter((f) => f.startsWith('run-') && f.endsWith('.jsonl')).sort();
  return files.length ? path.join(REPORT_DIR, files.at(-1)) : null;
}

async function main() {
  const { runAgent, __resetThrottleForTest } = await import('../src/ai/agent.js');
  const { loadAiConfig } = await import('../src/ai/llm.js');
  const { scoreTurn, aggregate, renderMarkdown } = await import('./scoring.mjs');

  const cfg = loadAiConfig();
  if (!cfg) {
    console.error('AI 未配置:请先在 ~/.stock-learning/ai.json 填入 apiKey(或设 ZHIPU_API_KEY)');
    process.exit(1);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  let jsonlPath;
  if (resume) {
    jsonlPath = latestRunFile();
    if (!jsonlPath) { console.error('--resume 但没有历史 run-*.jsonl'); process.exit(1); }
    console.log(`续跑:${path.basename(jsonlPath)}`);
  } else {
    jsonlPath = path.join(REPORT_DIR, `run-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jsonl`);
  }

  const selected = CASES.filter((c) => !only || only.has(c.id));
  const done = loadDoneCases(jsonlPath);
  const rows = [...readRows(jsonlPath)]; // 续跑时聚合包含历史行
  console.log(`模型 ${cfg.model} | 用例 ${selected.length}/${CASES.length} | 输出 ${path.basename(jsonlPath)}\n`);

  for (const c of selected) {
    const doneTurns = done.get(c.id) || 0;
    if (doneTurns >= c.turns.length) continue; // 该用例已完整跑过
    if (doneTurns > 0) console.log(`[${c.id}] 续跑(已完成 ${doneTurns}/${c.turns.length} 轮)`);

    // 用例间隔离:清掉上一用例的对话历史(fixture 只读业务数据,AI 只写 chat.json)
    fs.rmSync(CHAT_FILE, { force: true });

    for (let i = doneTurns; i < c.turns.length; i++) {
      const turn = c.turns[i];
      __resetThrottleForTest();
      const collector = createCollector();
      const t0 = Date.now();
      let r;
      try {
        r = await runAgent(turn.userMessage, collector.onEvent);
      } catch (err) {
        r = { ok: false, reason: `runner 异常:${err.message}` };
      }
      const actual = buildActual(r, collector.stats(), Date.now() - t0);
      const scored = scoreTurn(turn.expected, actual);
      const row = {
        caseId: c.id, turn: i, category: c.category, userMessage: turn.userMessage,
        pass: scored.pass, failures: scored.failures, checks: scored.checks,
        ...actual,
        // replyText 可能较长,明细里保留(grep 排障用);不存完整工具结果
      };
      fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
      rows.push(row);
      const mark = scored.pass ? 'PASS' : `FAIL ${scored.failures.join(';').slice(0, 120)}`;
      console.log(`[${c.id}·T${i + 1}] ${(actual.latencyMs / 1000).toFixed(1)}s tools=${actual.toolCalls}(${actual.toolEvents.total}事件) ${mark}`);
      await sleep(1500); // 上游与 LLM 缓冲
    }
  }

  const summary = aggregate(rows);
  const meta = { date: new Date().toISOString().slice(0, 10), model: cfg.model };
  const md = renderMarkdown(summary, meta);
  const base = jsonlPath.replace(/\.jsonl$/, '');
  fs.writeFileSync(`${base}-summary.json`, JSON.stringify({ meta, summary, failures: rows.filter((r) => !r.pass).map(({ caseId, turn, failures }) => ({ caseId, turn, failures })) }, null, 2));
  fs.writeFileSync(`${base}-summary.md`, md + '\n\n## 未通过明细\n\n' + (rows.filter((r) => !r.pass).map((r) => `- **${r.caseId}·T${r.turn + 1}** ${r.userMessage}\n  - ${r.failures.join('\n  - ')}`).join('\n') || '(全部通过)') + '\n');
  console.log('\n' + md);
  console.log(`\n报告:${base}-summary.md / .json`);
}

function readRows(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  return fs.readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

main().catch((err) => { console.error('eval runner crashed:', err); process.exit(1); });
