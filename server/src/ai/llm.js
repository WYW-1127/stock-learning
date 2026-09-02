// LLM 层 — 智谱 GLM(OpenAI 兼容)客户端 + 仓库外配置读取
// 配置优先级:环境变量 ZHIPU_API_KEY / AI_MODEL > ~/.stock-learning/ai.json > 默认
// 红线:apiKey 不入库、不进日志、不回传前端(status 只返回 configured 布尔)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(os.homedir(), '.stock-learning', 'ai.json');
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4-flash';

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
 * 网络/HTTP 失败重试 1 次(退避 2s);仍失败抛错(由 agent 层降级)
 */
export async function chatCompletion(cfg, messages, tools) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2000);
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
        throw new Error(`LLM HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      return json.choices?.[0]?.message;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
