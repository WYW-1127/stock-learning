// LLM 层 — 智谱 GLM(OpenAI 兼容)客户端 + 仓库外配置读取
// 配置优先级:环境变量 ZHIPU_API_KEY / AI_MODEL > ~/.stock-learning/ai.json > 默认
// 红线:apiKey 不入库、不进日志、不回传前端(status 只返回 configured 布尔)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(os.homedir(), '.stock-learning', 'ai.json');
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
// GLM-5 系最新(2026-09):glm-5.3-flash 能力对标 Claude Opus 4.8、价格为旗舰 glm-5.3 的 1/10、支持 FC;
// 思考内容在独立字段,不影响 content 的 JSON 解析。备选:免费 glm-4.7-flash(高峰单轮可达 25s,实测 2026-09-02)/ 最强 glm-5.3(改配置即可)
const DEFAULT_MODEL = 'glm-5.3-flash';
// GLM-5.3 系不支持关闭思考(thinking.type=disabled 官方明说不允许),思考深度默认开满(分析质量优先,
// 思考过程已通过流式实时展示给用户,等待可感知)。追求更快可在 ai.json 配 "reasoningEffort": "low"
// (实测省 ~1s/轮,但会诱发跳过工具直接编数,agent 有防编造闸门兜底,仍不建议)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读取配置;返回 null 表示未配置(前端展示配置指引)
export function loadAiConfig() {
  const apiKey = process.env.ZHIPU_API_KEY || readConfigFile().apiKey;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.AI_BASE_URL || readConfigFile().baseUrl || DEFAULT_BASE_URL,
    model: process.env.AI_MODEL || readConfigFile().model || DEFAULT_MODEL,
    reasoningEffort: process.env.AI_REASONING_EFFORT || readConfigFile().reasoningEffort || null,
  };
}

// 读取配置文件(容错:不存在/损坏返回空对象;字段级缓存避免重复读盘)
let _fileCache;
function readConfigFile() {
  if (_fileCache !== undefined) return _fileCache;
  try {
    _fileCache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    _fileCache = {};
  }
  return _fileCache;
}

// 供配置指引展示的路径(不含内容)
export const configFilePath = () => CONFIG_PATH;

/**
 * 调用 chat/completions(OpenAI 兼容)
 * @param cfg loadAiConfig() 的返回
 * @param messages [{role, content}] 含 tool 结果消息
 * @param tools OpenAI 格式工具 schema(可省略)
 * @returns choices[0].message
 * 重试策略:429(免费模型高峰限流常见)与网络错误退避重试两次(5s/15s);
 * 4xx 凭据/参数类错误(401/400/1113 余额等)重试无意义,直接抛由 agent 层降级
 */
export async function chatCompletion(cfg, messages, tools) {
  const delays = [0, 5000, 15000];
  let lastErr;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await sleep(delays[attempt]);
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
          temperature: 0.3,
          ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`LLM HTTP ${res.status} ${body.slice(0, 200)}`);
        err.status = res.status;
        // 仅 429 值得退避重试;其余 4xx(鉴权/余额/参数)立即失败
        if (res.status !== 429) throw err;
        lastErr = err;
        continue;
      }
      const json = await res.json();
      return json.choices?.[0]?.message;
    } catch (err) {
      if (err.status && err.status !== 429) throw err; // 非重试类直接抛
      lastErr = err; // 网络错误/超时 → 重试
    }
  }
  throw lastErr;
}

/**
 * 流式调用 chat/completions(SSE)。GLM 思考增量(delta.reasoning_content)与正式内容增量
 * (delta.content)经 onDelta 实时回调,用于前端展示思考过程;返回拼装完成的完整 message,
 * 语义与 chatCompletion 一致(content + 可选 tool_calls)。
 * 429 退避仅在收到响应头之前有效(尚未向回调吐过字,可安全重试);流中途网络错误直接抛由 agent 降级。
 * @param onDelta ({reasoning?, content?}) => void  可省略
 */
export async function chatCompletionStream(cfg, messages, tools, onDelta) {
  const delays = [0, 5000, 15000];
  let lastErr;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await sleep(delays[attempt]);
    let res;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: true,
          ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
          temperature: 0.3,
          ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(180000), // 思考开满 + 多轮生成,总时长放宽
      });
    } catch (err) {
      lastErr = err; // 网络错误 → 重试
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`LLM HTTP ${res.status} ${body.slice(0, 200)}`);
      err.status = res.status;
      if (res.status !== 429) throw err; // 鉴权/余额/参数类立即失败
      lastErr = err;
      continue;
    }
    return await consumeSseStream(res.body, onDelta);
  }
  throw lastErr;
}

/**
 * 解析 SSE 字节流 → 完整 message(导出以便单测:tool_calls 分片拼装/思考与内容分流)
 * @param body ReadableStream(fetch res.body)
 */
export async function consumeSseStream(body, onDelta) {
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const toolCalls = [];
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue; // 非完整 JSON 行跳过(SSE 按行已切分,一般不会发生)
      }
      const choice = j.choices?.[0];
      const d = choice?.delta;
      if (d?.reasoning_content) onDelta?.({ reasoning: d.reasoning_content });
      if (d?.content) {
        content += d.content;
        onDelta?.({ content: d.content });
      }
      if (Array.isArray(d?.tool_calls)) {
        for (const tc of d.tool_calls) {
          const i = tc.index ?? 0;
          // 流式分片不带 type,必须补上,否则 assistant 消息回传时报 1214"工具类型不能为空"
          toolCalls[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      }
    }
  }
  const message = { content };
  const assembled = toolCalls.filter(Boolean);
  if (assembled.length) message.tool_calls = assembled;
  return message;
}
