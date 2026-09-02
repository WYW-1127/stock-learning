// Agent 主循环 — 意图/实体由 LLM 理解,工具由本模块执行:
// LLM(流式,思考增量经 onEvent 外发)→ tool_calls → 同轮并行执行回填 → 循环(≤12 次工具)
// → 最终文本提取校验 JSON(防编造闸门/失败修复重试各1次)→ 落盘历史
import { loadAiConfig, chatCompletionStream } from './llm.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { extractJson, validateReply, fallbackReply } from './schemas.js';
import { loadHistory, appendMessage } from './context.js';

const MAX_TOOL_CALLS = 12; // 单轮工具调用上限(spec:批量快照优先,多持仓也不应触顶)
const TOOL_RESULT_MAX_CHARS = 6000; // 单个工具结果回填上限(截断防 token 膨胀;K线原始数据允许不完整)

// 会话节流:同进程 10 秒内仅接受一次提问(429 语义)
let lastAskAt = 0;

// 防编造闸门:回复声称查到了数据(facts 非空)或给出了方向性结论(decision ≠ none),
// 却一次工具都没调 → 数字没有来源,必须打回;纯问答类(qa/闲聊)允许零工具
function claimsData(reply) {
  return Object.keys(reply.facts || {}).length > 0 || !['none', 'fallback'].includes(reply.decision);
}

// 仅供单测重置节流状态
export function __resetThrottleForTest() {
  lastAskAt = 0;
}

/**
 * 处理一轮用户消息(含历史落盘)
 * @param {string} message 用户自然语言
 * @param {(ev: object) => void} [onEvent] 过程事件回调(思考增量/工具进度),供流式展示;
 *   事件:{type:'reasoning', round, text} | {type:'tool', name, args} | {type:'tool_done', name, ok}
 * @returns {Promise<{ok:true, reply, toolCalls:number}|{ok:false, reason}>}
 */
export async function runAgent(message, onEvent) {
  const emit = (ev) => {
    try {
      onEvent?.(ev);
    } catch {} // 展示层回调异常不影响分析主流程
  };
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
  let round = 0; // LLM 调用轮次(思考过程按轮分段展示)
  let jsonRepaired = false; // JSON 格式修复重试预算:1 次
  let factsRepaired = false; // 零工具带数据打回重试预算:1 次(与 JSON 修复分开,互不挤占)

  try {
    while (toolCallCount <= MAX_TOOL_CALLS) {
      round++;
      const msg = await chatCompletionStream(cfg, messages, TOOL_SCHEMAS, (d) => {
        if (d.reasoning) emit({ type: 'reasoning', round, text: d.reasoning });
      });

      // 工具调用分支
      if (msg?.tool_calls?.length) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
        // 同轮多个工具互不依赖,并行执行省时间;结果按原顺序回填,tool_call_id 对应不变
        const results = await Promise.all(
          msg.tool_calls.map(async (tc) => {
            let args = {};
            try {
              args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              args = { error: '工具参数不是合法 JSON' };
            }
            emit({ type: 'tool', name: tc.function?.name || '未知工具', args });
            const result = await executeTool(tc.function?.name, args);
            emit({ type: 'tool_done', name: tc.function?.name || '未知工具', ok: !result?.error });
            return result;
          }),
        );
        msg.tool_calls.forEach((tc, i) => {
          toolCallCount++;
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(results[i]).slice(0, TOOL_RESULT_MAX_CHARS),
          });
        });
        continue;
      }

      // 最终回答分支:提取 + 校验 + 防编造闸门 + 修复重试
      const text = typeof msg?.content === 'string' ? msg.content : '';
      const raw = extractJson(text);
      const checked = validateReply(raw);
      if (checked.valid) {
        if (toolCallCount === 0 && claimsData(checked.reply)) {
          // 带着数字/结论却没查任何工具:打回补查;仍不查则拦截,不输出未经验证的内容
          if (!factsRepaired) {
            factsRepaired = true;
            messages.push({ role: 'assistant', content: text.slice(0, 2000) });
            messages.push({
              role: 'user',
              content: '你的回复包含行情/持仓/指标等数据,但本次一次工具都没有调用,数字无法验证(严禁凭记忆编造数字,历史对话里的数字也视为过期)。请先调用工具查询真实数据,再重新输出符合约定的 JSON。',
            });
            continue;
          }
          appendMessage('user', String(message).slice(0, 500));
          appendMessage('assistant', 'AI 未能取得可验证的数据,已拦截本次回答,请重新提问。');
          return {
            ok: true,
            reply: fallbackReply(null, 'AI 未能查询到可验证的数据,为防止编造数字已拦截本次回答,请重新提问或稍后再试。'),
            toolCalls: toolCallCount,
          };
        }
        appendMessage('user', String(message).slice(0, 500));
        appendMessage('assistant', checked.reply.suggestion);
        return { ok: true, reply: checked.reply, toolCalls: toolCallCount };
      }
      if (!jsonRepaired) {
        jsonRepaired = true;
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

    // 工具调用触顶:数据已在上下文里,强制模型基于已查数据直接收尾,而不是让用户拆小问题
    messages.push({
      role: 'user',
      content:
        '工具调用次数已达上限,不要再调用任何工具。请基于上面已查到的真实数据,直接输出符合约定的 JSON;没查到的维度在 facts 里如实注明"未查询",严禁编造。',
    });
    const finalMsg = await chatCompletionStream(cfg, messages, undefined, (d) => {
      if (d.reasoning) emit({ type: 'reasoning', round: round + 1, text: d.reasoning });
    });
    const rawFinal = extractJson(typeof finalMsg?.content === 'string' ? finalMsg.content : '');
    const checkedFinal = validateReply(rawFinal);
    // 收尾时工具结果已在上下文里,facts 引用它们合法;未查到数据是否编造靠上面的 prompt 约束
    if (checkedFinal.valid) {
      appendMessage('user', String(message).slice(0, 500));
      appendMessage('assistant', checkedFinal.reply.suggestion);
      return { ok: true, reply: checkedFinal.reply, toolCalls: toolCallCount };
    }
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
