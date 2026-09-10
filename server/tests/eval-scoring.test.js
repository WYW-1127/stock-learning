// 评估评分纯函数单测 — scoreTurn 各断言分支 + aggregate 指标口径 + markdown 渲染
import { describe, it, expect } from 'vitest';
import { scoreTurn, aggregate, renderMarkdown } from '../evals/scoring.mjs';

const actualOf = (over = {}) => ({
  ok: true, intent: 'buy_analysis', decision: 'watch', symbol: 'sz002594',
  toolNames: ['search_stock', 'get_stock_quote'], toolCalls: 2, factsKeys: 3,
  replyText: '{"suggestion":"请自行操作"}', isFallback: false, intercepted: false,
  toolEvents: { total: 2, errors: 0, argParseFails: 0 }, maxRound: 2, latencyMs: 50000,
  ...over,
});

describe('scoreTurn', () => {
  it('全命中通过', () => {
    const r = scoreTurn(
      { intent: ['buy_analysis'], symbol: 'sz002594', toolsMust: ['search_stock'], toolsAnyOf: ['get_stock_quote'], requiresToolCalls: true, factsNonEmpty: true, textContainsAny: ['自行'] },
      actualOf(),
    );
    expect(r.pass).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('intent 不在集合 → 失败并给人话', () => {
    const r = scoreTurn({ intent: ['qa'] }, actualOf({ intent: 'buy_analysis' }));
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toContain('buy_analysis');
  });

  it("symbol:null 断言未绑定个股(null 通过,绑定失败)", () => {
    expect(scoreTurn({ symbol: null }, actualOf({ symbol: null })).pass).toBe(true);
    expect(scoreTurn({ symbol: null }, actualOf()).pass).toBe(false);
  });

  it('必选工具缺失 / 禁用工具出现 / 预期外工具,分别报错', () => {
    const r = scoreTurn(
      { toolsMust: ['get_position'], toolsMustNot: ['get_stock_kline'], toolsAnyOf: ['search_stock'] },
      actualOf({ toolNames: ['search_stock', 'get_stock_kline'] }),
    );
    expect(r.checks['toolsMust']).toBe(false);
    expect(r.checks['toolsMustNot']).toBe(false);
    expect(r.checks['toolSet']).toBe(false); // get_stock_kline 也不在 anyOf 内
    expect(r.failures).toHaveLength(3);
  });

  it('requiresToolCalls true/false 两个方向', () => {
    expect(scoreTurn({ requiresToolCalls: true }, actualOf({ toolCalls: 0 })).pass).toBe(false);
    expect(scoreTurn({ requiresToolCalls: false }, actualOf({ toolCalls: 0, toolNames: [] })).pass).toBe(true);
    expect(scoreTurn({ requiresToolCalls: false }, actualOf()).pass).toBe(false);
  });

  it('facts 为空 / 关键词未命中 → 失败', () => {
    expect(scoreTurn({ factsNonEmpty: true }, actualOf({ factsKeys: 0 })).pass).toBe(false);
    expect(scoreTurn({ textContainsAny: ['自行', '面板'] }, actualOf({ replyText: '{"suggestion":"别买了"}' })).pass).toBe(false);
  });

  it('runAgent 失败(ok:false)→ runOk 失败', () => {
    const r = scoreTurn({}, actualOf({ ok: false, error: 'AI 未配置' }));
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toContain('AI 未配置');
  });
});

describe('aggregate', () => {
  const row = (caseId, checks, over = {}) => ({
    caseId, pass: Object.values(checks).every(Boolean), checks,
    ok: true, intent: 'qa', intercepted: false,
    toolEvents: { total: 1, errors: 0, argParseFails: 0 },
    toolCalls: 1, maxRound: 1, latencyMs: 1000, ...over,
  });

  it('case 级通过率要求所有 turn 全过', () => {
    const s = aggregate([
      row('A', { intent: true }),
      row('A', { intent: false }),
      row('B', { intent: true }),
    ]);
    expect(s.totalTurns).toBe(3);
    expect(s.casePassRate).toBe(50); // A 挂了,B 过
    expect(s.turnPassRate).toBe(66.7);
    expect(s.intentAccuracy).toBe(66.7);
  });

  it('严格口径比宽松多算"预期外工具"一刀', () => {
    const s = aggregate([
      row('A', { toolsMust: true, toolsMustNot: true, toolSet: false }), // 调了预期外
      row('B', { toolsMust: true, toolsMustNot: true, toolSet: true }),
    ]);
    expect(s.toolSelectionStrict).toBe(50);
    expect(s.toolSelectionLoose).toBe(100);
  });

  it('未查先答率与闸门拦截率分开统计', () => {
    const s = aggregate([
      row('A', { 'toolCalls>=1': false }, { toolCalls: 0 }), // 要求查证却零工具
      row('B', { intent: true }, { intercepted: true }),     // 闸门拦截(防线生效)
      row('C', { intent: true }),
    ]);
    expect(s.unverifiedClaimsRate).toBe(33.3);
    expect(s.gateInterceptedRate).toBe(33.3);
  });

  it('零工具调用时错误率输出 null(不虚构 0%)', () => {
    const s = aggregate([row('A', { intent: true }, { toolEvents: { total: 0, errors: 0, argParseFails: 0 }, toolCalls: 0 })]);
    expect(s.invalidToolCallRate).toBeNull();
    expect(s.toolExecErrorRate).toBeNull();
  });

  it('延迟 mean/p50/p95', () => {
    const s = aggregate([1, 2, 3, 4, 5].map((i) => row(`C${i}`, { intent: true }, { latencyMs: i * 1000 })));
    expect(s.latencyMs.mean).toBe(3000);
    expect(s.latencyMs.p50).toBe(3000);
    expect(s.latencyMs.p95).toBe(5000);
  });
});

describe('renderMarkdown', () => {
  it('包含模型元信息与核心指标行', () => {
    const s = aggregate([{ caseId: 'A', pass: true, checks: { intent: true }, ok: true, intent: 'qa', intercepted: false, toolEvents: { total: 0, errors: 0, argParseFails: 0 }, toolCalls: 0, maxRound: 1, latencyMs: 1000 }]);
    const md = renderMarkdown(s, { date: '2026-09-10', model: 'glm-5.3-flash' });
    expect(md).toContain('glm-5.3-flash');
    expect(md).toContain('Intent 识别准确率');
    expect(md).toContain('未查先答率');
  });
});
