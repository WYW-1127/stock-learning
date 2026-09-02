// AI 层单测:schemas(JSON 提取/校验/降级)+ agent(工具循环/修复重试/降级)+ tools(分发与错误包装)
// agent 测试全 mock(llm/tools/context),不发真实网络
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---- schemas ----
import { extractJson, validateReply, fallbackReply } from '../src/ai/schemas.js';

const GOOD = {
  intent: 'sell_analysis', symbol: 'sz000001', decision: 'hold',
  stanceText: '综合判断:偏向持有', confidence: 'medium',
  facts: { last: 11.35, cost: 10.2 },
  analysis: { trend: 'bullish', technical: '站上20日线' },
  reasons: ['现价高于成本 11%'], risks: ['大盘走弱'], coachQuestions: ['注意换手率了吗?'],
  suggestion: '持有,关注 11.0 支撑。',
};

describe('extractJson', () => {
  it('纯 JSON 直接解析', () => {
    expect(extractJson(JSON.stringify(GOOD)).intent).toBe('sell_analysis');
  });
  it('markdown 围栏剥离', () => {
    expect(extractJson('```json\n' + JSON.stringify(GOOD) + '\n```').decision).toBe('hold');
  });
  it('前后杂文截取最外层对象', () => {
    expect(extractJson('好的,以下是分析:\n' + JSON.stringify(GOOD) + '\n希望有帮助').stanceText).toBeTruthy();
  });
  it('无 JSON 返回 null', () => {
    expect(extractJson('纯文本')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('validateReply', () => {
  it('合法对象通过并规范化(未知字段丢弃)', () => {
    const r = validateReply({ ...GOOD, hackerField: 'x' });
    expect(r.valid).toBe(true);
    expect(r.reply.intent).toBe('sell_analysis');
    expect(r.reply).not.toHaveProperty('hackerField');
  });
  it('缺 stanceText / intent 非法 → 报错清单', () => {
    const r = validateReply({ ...GOOD, stanceText: '', intent: 'xxx' });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain('stanceText');
    expect(r.errors.join()).toContain('intent');
  });
  it('symbol 非规范格式 → null 但不失败', () => {
    const r = validateReply({ ...GOOD, symbol: '平安银行' });
    expect(r.valid).toBe(true);
    expect(r.reply.symbol).toBeNull();
  });
  it('reasons 非数组 → 空数组兜底', () => {
    const r = validateReply({ ...GOOD, reasons: '不是数组' });
    expect(r.valid).toBe(true);
    expect(r.reply.reasons).toEqual([]);
  });
});

describe('fallbackReply', () => {
  it('结构完整且 suggestion 填充', () => {
    const f = fallbackReply('原文内容', '备注');
    expect(f.intent).toBe('fallback');
    expect(f.suggestion).toBe('原文内容');
  });
});

// ---- agent(mock 依赖) ----
vi.mock('../src/ai/llm.js', () => ({
  loadAiConfig: () => ({ apiKey: 'test-key', baseUrl: 'http://mock', model: 'mock' }),
  chatCompletion: vi.fn(),
}));
vi.mock('../src/ai/context.js', () => ({
  loadHistory: () => [],
  appendMessage: vi.fn(),
  clearHistory: vi.fn(),
}));

import { runAgent, __resetThrottleForTest } from '../src/ai/agent.js';
import { chatCompletion } from '../src/ai/llm.js';
import { executeTool } from '../src/ai/tools.js';

const FINAL_JSON = JSON.stringify(GOOD);
const toolMsg = (name, args, id) => ({
  content: '', tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  __resetThrottleForTest(); // 每用例重置 10 秒节流
});

describe('runAgent 主循环', () => {
  it('标准链路:先工具调用后 JSON 输出', async () => {
    chatCompletion
      .mockResolvedValueOnce(toolMsg('search_stock', { keyword: '平安银行' }, 't1'))
      .mockResolvedValueOnce(toolMsg('get_position', { symbol: 'sz000001' }, 't2'))
      .mockResolvedValueOnce({ content: FINAL_JSON });
    const spy = vi.spyOn({ executeTool }, 'executeTool'); // 仅占位不影响真实执行
    const r = await runAgent('我买的平安银行现在能卖吗?');
    expect(r.ok).toBe(true);
    expect(r.reply.intent).toBe('sell_analysis');
    expect(r.toolCalls).toBe(2);
    // 第二次 LLM 调用的消息里应包含工具结果(tool role)
    const secondCall = chatCompletion.mock.calls[1][1];
    expect(secondCall.some((m) => m.role === 'tool')).toBe(true);
    spy.mockRestore();
  });

  it('JSON 非法 → 修复重试一次后通过', async () => {
    chatCompletion
      .mockResolvedValueOnce({ content: '这不是JSON' })
      .mockResolvedValueOnce({ content: FINAL_JSON });
    const r = await runAgent('分析一下平安银行');
    expect(r.ok).toBe(true);
    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('修复重试仍失败 → 降级 fallback(用户不被阻塞)', async () => {
    chatCompletion.mockResolvedValue({ content: '始终不是JSON' });
    const r = await runAgent('分析一下平安银行');
    expect(r.ok).toBe(true);
    expect(r.reply.intent).toBe('fallback');
  });

  it('LLM 抛错 → 降级回复', async () => {
    chatCompletion.mockRejectedValue(new Error('network down'));
    const r = await runAgent('分析一下平安银行');
    expect(r.ok).toBe(true);
    expect(r.reply.suggestion).toContain('稍后再试');
  });

  it('工具调用触顶(>12)→ 返回拆小问题的提示', async () => {
    chatCompletion.mockImplementation(async () => toolMsg('get_account', {}, 't' + Math.random()));
    const r = await runAgent('全部持仓分析');
    expect(r.ok).toBe(true);
    expect(r.reply.suggestion).toContain('拆小');
  });
});

// ---- tools(真实执行器,仅测分发与错误包装;行情依赖 mock 不了的部分跳过) ----
import { TOOL_SCHEMAS } from '../src/ai/tools.js';

describe('TOOL_SCHEMAS', () => {
  it('共 9 个工具且命名符合 spec', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name);
    expect(names.sort()).toEqual([
      'calculate_indicators', 'get_account', 'get_market_context', 'get_portfolio_risk_snapshot',
      'get_position', 'get_stock_kline', 'get_stock_quote', 'get_trade_history', 'search_stock',
    ].sort());
  });
  it('工具注册表不含任何下单能力(物理隔离,只有只读工具)', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name);
    const FORBIDDEN = ['place_order', 'submit_order', 'create_order', 'cancel_order', 'execute_order', 'buy_stock', 'sell_stock', 'reset_account'];
    for (const f of FORBIDDEN) expect(names).not.toContain(f);
    // 允许的只读类白名单
    const ALLOWED = new Set(names);
    expect([...ALLOWED]).toHaveLength(9);
  });
});

describe('executeTool 错误包装', () => {
  it('未知工具返回 error 不抛异常', async () => {
    const r = await executeTool('no_such_tool', {});
    expect(r.error).toContain('未知工具');
  });
  it('symbol 格式非法返回 error(get_position)', async () => {
    const r = await executeTool('get_position', { symbol: '不是代码' });
    expect(r.error).toContain('格式不正确');
  });
});
