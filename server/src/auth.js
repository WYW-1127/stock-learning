// Basic Auth 中间件 — 公网部署时的简单口令保护(仅自己使用场景)
// 环境变量 AUTH_USER + AUTH_PASS 都非空时启用;任一缺失返回 null 不挂载,本地使用零影响
// 白名单 /api/meta/status:只暴露盘中/盘后状态,供容器健康检查免凭据探测
import crypto from 'node:crypto';

const PUBLIC_PATHS = new Set(['/api/meta/status']);

// 等长才可比;长度不等时用同长度比较消耗时间,避免按长度探测侧信道
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// 返回 express 中间件;未配置返回 null
export function createAuth(user, pass) {
  if (!user || !pass) return null;
  const expected = Buffer.from(`${user}:${pass}`).toString('base64');
  return function auth(req, res, next) {
    if (PUBLIC_PATHS.has(req.path)) return next();
    const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
    if (m && safeEqual(m[1].trim(), expected)) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="stock-learning", charset="UTF-8"');
    res.status(401).json({ ok: false, error: 'unauthorized' });
  };
}
