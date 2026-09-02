// 多轮对话上下文 — data/chat.json:只存用户/助手最终问答(工具过程不落盘)
// 写入复用临时文件 + rename 原子写;超过 200 条自动截断保留最近 100
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHAT_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'chat.json')
  : path.join(__dirname, '..', '..', '..', 'data', 'chat.json');

const HISTORY_LIMIT = 20; // 每次传给 LLM 的历史条数

export function loadHistory(limit = HISTORY_LIMIT) {
  try {
    const all = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    return Array.isArray(all) ? all.slice(-limit) : [];
  } catch {
    return [];
  }
}

export function appendMessage(role, content) {
  let all = loadHistory(Infinity);
  all.push({ role, content, ts: new Date().toISOString() });
  if (all.length > 200) all = all.slice(-100); // 防文件无限膨胀
  fs.mkdirSync(path.dirname(CHAT_FILE), { recursive: true });
  const tmp = `${CHAT_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, CHAT_FILE);
}

export function clearHistory() {
  fs.mkdirSync(path.dirname(CHAT_FILE), { recursive: true });
  const tmp = `${CHAT_FILE}.tmp`;
  fs.writeFileSync(tmp, '[]');
  fs.renameSync(tmp, CHAT_FILE);
}
