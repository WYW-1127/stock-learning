// LLM 层 — 智谱 GLM(OpenAI 兼容)客户端 + 仓库外配置读取
// 配置优先级:环境变量 ZHIPU_API_KEY / AI_MODEL > ~/.stock-learning/ai.json > 默认
// 红线:apiKey 不入库、不进日志、不回传前端(status 只返回 configured 布尔)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(os.homedir(), '.stock-learning', 'ai.json');
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
// GLM-5 系最新(2026-09):glm-5.3-flash 能力对标 Claude Opus 4.8、价格为旗舰 glm-5.3 的 1/10、支持 FC;
// 思考内容在独立字段,不影响 content 的 JSON 解析。备选:免费 glm-4.7-flash / 最强 glm-5.3(改配置即可)
const DEFAULT_MODEL = 'glm-5.3-flash';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读取配置;返回 null 表示未配置(前端展示配置指引)
export function loadAiConfig() {
  const apiKey = process.env.ZHIPU_API_KEY || readConfigFile().apiKey;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.AI_BASE_URL || readConfigFile().baseUrl || DEFAULT_BASE_URL,
    model: process.env.AI_MODEL || readConfigFile().model || DEFAULT_MODEL,
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
