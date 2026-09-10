// 评估评分 — 纯函数:单轮断言 + 指标聚合,不做任何 IO(runner 负责)
// actual 结构由 runner 从 runAgent 返回值与 onEvent 事件流构造:
//   { ok, intent, decision, symbol, toolNames[], toolCalls, factsKeys, replyText,
//     isFallback, intercepted, toolEvents:{total,errors,argParseFails}, maxRound, latencyMs, error }
// expected 字段(cases.json):
//   intent[]        实际 intent 必须在集合内
//   decision[]      同上(缺省不断言)
//   symbol          存在(含 null)即严格相等;'symbol':null 断言未绑定个股
//   toolsMust[]     全部被调用过
//   toolsMustNot[]  一个都不允许出现
//   toolsAnyOf[]    实际工具集 ⊆ must ∪ anyOf(严格口径的第三条件)
//   requiresToolCalls  true→至少1次;false→必须0次;缺省不判
//   factsNonEmpty   true→facts 至少一项
//   textContainsAny[]  JSON(reply) 含任一关键词

/** 对单轮实际结果打分;返回 { pass, failures: 人话错误列表, checks: 各断言明细 } */
export function scoreTurn(expected = {}, actual) {
  const failures = [];
  const checks = {};
  const check = (name, ok, msg) => {
    checks[name] = ok;
    if (!ok) failures.push(msg);
  };

  check('runOk', !!actual?.ok, actual?.error ? `runAgent 失败:${actual.error}` : 'runAgent 返回失败');
  if (expected.intent) {
    check('intent', expected.intent.includes(actual.intent), `intent=${actual.intent},期望 ∈ [${expected.intent.join('|')}]`);
  }
  if (expected.decision) {
    check('decision', expected.decision.includes(actual.decision), `decision=${actual.decision},期望 ∈ [${expected.decision.join('|')}]`);
  }
  if ('symbol' in expected) {
    check('symbol', actual.symbol === expected.symbol, `symbol=${actual.symbol},期望 ${expected.symbol}`);
  }

  const tools = actual.toolNames || [];
  if (expected.toolsMust?.length) {
    const missing = expected.toolsMust.filter((t) => !tools.includes(t));
    check('toolsMust', missing.length === 0, `应调用而未调用:${missing.join(',')}`);
  }
  if (expected.toolsMustNot?.length) {
    const forbidden = expected.toolsMustNot.filter((t) => tools.includes(t));
    check('toolsMustNot', forbidden.length === 0, `不应调用却调用了:${forbidden.join(',')}`);
  }
  if (expected.toolsMust?.length || expected.toolsAnyOf?.length) {
    const allowed = new Set([...(expected.toolsMust || []), ...(expected.toolsAnyOf || [])]);
    const unexpected = tools.filter((t) => !allowed.has(t));
    check('toolSet', unexpected.length === 0, `调用了预期外的工具:${unexpected.join(',')}`);
  }
  if (expected.requiresToolCalls === true) {
    check('toolCalls>=1', (actual.toolCalls || 0) >= 1, `期望至少 1 次工具调用,实际 ${actual.toolCalls || 0}`);
  }
  if (expected.requiresToolCalls === false) {
    check('toolCalls===0', (actual.toolCalls || 0) === 0, `纯问答期望零工具,实际调用了 ${actual.toolCalls || 0} 次`);
  }
  if (expected.factsNonEmpty) {
    check('factsNonEmpty', (actual.factsKeys || 0) > 0, 'facts 为空(要求给出查到的关键事实)');
  }
  if (expected.textContainsAny?.length) {
    const hit = expected.textContainsAny.some((kw) => (actual.replyText || '').includes(kw));
    check('textContains', hit, `回复未包含任一关键词:[${expected.textContainsAny.join('|')}]`);
  }

  return { pass: failures.length === 0, failures, checks };
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** 聚合多轮评分结果;rows 为 runner 记录的逐轮明细(含 checks) */
export function aggregate(rows) {
  const total = rows.length;
  const has = (r, k) => r.checks && k in r.checks;
  const okCount = (k) => rows.filter((r) => has(r, k) && r.checks[k]).length;
  const denom = (k) => rows.filter((r) => has(r, k)).length;

  const latencies = rows.map((r) => r.latencyMs || 0).sort((a, b) => a - b);
  const pick = (q) => (total ? latencies[Math.min(total - 1, Math.floor(q * total))] : 0);
  const toolTotal = rows.reduce((s, r) => s + (r.toolEvents?.total || 0), 0);
  const toolErrors = rows.reduce((s, r) => s + (r.toolEvents?.errors || 0), 0);
  const argParseFails = rows.reduce((s, r) => s + (r.toolEvents?.argParseFails || 0), 0);

  const zeroToolRequired = rows.filter((r) => has(r, 'toolCalls>=1') && !r.checks['toolCalls>=1']).length;
  const intercepted = rows.filter((r) => r.intercepted).length;
  const validFinal = rows.filter((r) => r.ok && r.intent && r.intent !== 'fallback').length;

  // 工具选择:凡带工具期望(toolsMust / toolsMustNot / toolSet)的轮次计入分母
  const toolTurns = rows.filter((r) => has(r, 'toolsMust') || has(r, 'toolsMustNot') || has(r, 'toolSet'));
  const passIf = (r, key) => (has(r, key) ? r.checks[key] : true);
  const looseOk = (r) => passIf(r, 'toolsMust') && passIf(r, 'toolsMustNot');
  const strictOk = (r) => looseOk(r) && passIf(r, 'toolSet');

  // case 级通过率:同一 caseId 的所有 turn 都 pass
  const byCase = new Map();
  for (const r of rows) byCase.set(r.caseId, (byCase.get(r.caseId) ?? true) && r.pass);

  return {
    totalTurns: total,
    totalCases: byCase.size,
    casePassRate: pct([...byCase.values()].filter(Boolean).length, byCase.size),
    turnPassRate: pct(rows.filter((r) => r.pass).length, total),
    intentAccuracy: pct(okCount('intent'), denom('intent')),
    toolSelectionStrict: pct(toolTurns.filter(strictOk).length, toolTurns.length),
    toolSelectionLoose: pct(toolTurns.filter(looseOk).length, toolTurns.length),
    symbolAccuracy: pct(okCount('symbol'), denom('symbol')),
    decisionAccuracy: pct(okCount('decision'), denom('decision')),
    finalAnswerValidity: pct(validFinal, total),
    gateInterceptedRate: pct(intercepted, total),
    unverifiedClaimsRate: pct(zeroToolRequired, total),
    invalidToolCallRate: toolTotal ? pct(argParseFails, toolTotal) : null,
    toolExecErrorRate: toolTotal ? pct(toolErrors, toolTotal) : null,
    avgToolCalls: total ? Math.round((rows.reduce((s, r) => s + (r.toolCalls || 0), 0) / total) * 100) / 100 : null,
    avgLlmRounds: total ? Math.round((rows.reduce((s, r) => s + (r.maxRound || 0), 0) / total) * 100) / 100 : null,
    latencyMs: {
      mean: total ? Math.round(latencies.reduce((s, x) => s + x, 0) / total) : null,
      p50: pick(0.5),
      p95: pick(0.95),
    },
  };
}

/** 把 summary 渲染成人读 markdown(评估报告用) */
export function renderMarkdown(summary, meta) {
  const rows = [
    ['Case 通过率(所有轮全过)', `${summary.casePassRate}%`],
    ['Turn 通过率', `${summary.turnPassRate}%`],
    ['Intent 识别准确率', `${summary.intentAccuracy}%`],
    ['工具选择准确率(严格)', `${summary.toolSelectionStrict}%`],
    ['工具选择准确率(宽松)', `${summary.toolSelectionLoose}%`],
    ['实体/Symbol 解析准确率', `${summary.symbolAccuracy}%`],
    ['Decision 合规率', `${summary.decisionAccuracy}%`],
    ['最终应答有效率(非 fallback)', `${summary.finalAnswerValidity}%`],
    ['防编造闸门拦截率', `${summary.gateInterceptedRate}%`],
    ['未查先答率(要求查证却零工具)', `${summary.unverifiedClaimsRate}%`],
    ['无效工具调用率(参数解析失败)', summary.invalidToolCallRate == null ? '—(零工具调用)' : `${summary.invalidToolCallRate}%`],
    ['工具执行错误率', summary.toolExecErrorRate == null ? '—(零工具调用)' : `${summary.toolExecErrorRate}%`],
    ['平均工具调用次数 / 轮', summary.avgToolCalls],
    ['平均 LLM 轮次', summary.avgLlmRounds],
    ['延迟 mean / p50 / p95(秒)', `${(summary.latencyMs.mean / 1000).toFixed(1)} / ${(summary.latencyMs.p50 / 1000).toFixed(1)} / ${(summary.latencyMs.p95 / 1000).toFixed(1)}`],
  ];
  return [
    '# AI Agent 离线评估报告',
    '',
    `- 日期:${meta.date} | 模型:${meta.model} | 用例:${summary.totalCases} 例 / ${summary.totalTurns} 轮`,
    '- 口径:temperature=0.3,LLM 输出有随机性,以下为本机本次真实运行结果,非承诺值',
    '- 指标定义见 docs/evaluation.md',
    '',
    '| 指标 | 值 |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
}
