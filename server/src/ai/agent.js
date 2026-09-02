// Agent 主循环 — 意图/实体由 LLM 理解,工具由本模块执行:
// LLM → tool_calls → 执行回填 → 循环(≤12 次工具)→ 最终文本提取校验 JSON(失败修复重试1次)→ 落盘历史
import { loadAiConfig, chatCompletion } from './llm.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { extractJson, validateReply, fallbackReply } from './schemas.js';
import { loadHistory, appendMessage } from './context.js';

const MAX_TOOL_CALLS = 12; // 单轮工具调用上限(spec:批量快照优先,多持仓也不应触顶)
const TOOL_RESULT_MAX_CHARS = 6000; // 单个工具结果回填上限(截断防 token 膨胀;K线原始数据允许不完整)

// 会话节流:同进程 10 秒内仅接受一次提问(429 语义)
let lastAskAt = 0;

// 仅供单测重置节流状态
export function __resetThrottleForTest() {
  lastAskAt = 0;
}

/**
 * 处理一轮用户消息(含历史落盘)
 * @param {string} message 用户自然语言
 * @returns {Promise<{ok:true, reply, toolCalls:number}|{ok:false, reason}>}
 */
export async function runAgent(message) {
  const now = Date.now();
  if (now - lastAskAt < 10000) {
    return { ok: false, reason: '问得太快啦,喝口水 10 秒后再问~' };
  }
  lastAskAt = now;

  const cfg = loadAiConfig();
  if (!cfg) return { ok: false, reason: 'AI 未配置' };

  const history = loadHistory();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: String(message).slice(0, 1000) },
  ];

  let toolCallCount = 0;
  let repairRetried = false;

  try {
    while (toolCallCount <= MAX_TOOL_CALLS) {
      const msg = await chatCompletion(cfg, messages, TOOL_SCHEMAS);

      // 工具调用分支
      if (msg?.tool_calls?.length) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          toolCallCount++;
          let args = {};
          try {
            args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            args = { error: '工具参数不是合法 JSON' };
          }
          const result = await executeTool(tc.function?.name, args);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, TOOL_RESULT_MAX_CHARS),
          });
        }
        continue;
      }

      // 最终回答分支:提取 + 校验 + 修复重试
      const text = typeof msg?.content === 'string' ? msg.content : '';
      const raw = extractJson(text);
      const checked = validateReply(raw);
      if (checked.valid) {
        appendMessage('user', String(message).slice(0, 500));
        appendMessage('assistant', checked.reply.suggestion);
        return { ok: true, reply: checked.reply, toolCalls: toolCallCount };
      }
      if (!repairRetried) {
        repairRetried = true;
        messages.push({ role: 'assistant', content: text.slice(0, 2000) });
        messages.push({
          role: 'user',
          content: `你的输出未通过校验:${checked.errors.join(';')}。请重新输出符合约定的 JSON 对象,不要包含其他文字。`,
        });
        continue;
      }
      // 修复重试仍失败 → 降级为原文人话回复,不阻塞用户
      appendMessage('user', String(message).slice(0, 500));
      appendMessage('assistant', fallbackReply(text, 'AI 返回格式异常,以上是原文内容;请稍后再试。').suggestion);
      return { ok: true, reply: fallbackReply(text, 'AI 返回格式异常,以上是原文内容;请稍后再试。'), toolCalls: toolCallCount };
    }

    // 工具调用触顶:输出部分结果说明
    appendMessage('user', String(message).slice(0, 500));
    appendMessage('assistant', '本次查询的数据较多,处理超时,请把问题拆小一些再问。');
    return {
      ok: true,
      reply: fallbackReply(null, '本次查询的数据较多,处理超时,请把问题拆小一些再问(例如先问某一只股票)。'),
      toolCalls: toolCallCount,
    };
  } catch (err) {
    // 网络/API 失败:不落盘历史(用户重问),友好降级;ASCII 日志便于排障
    console.error(`[ai] agent failed: ${err.message}`);
    return {
      ok: true,
      reply: fallbackReply(null, 'AI 服务暂时不可用(网络或接口异常),请稍后再试;行情与交易功能不受影响。'),
      toolCalls: toolCallCount,
    };
  }
}
