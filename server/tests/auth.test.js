// Basic Auth 单测:启用判定、401/放行、白名单健康检查路径
import { describe, it, expect, vi } from 'vitest';
import { createAuth } from '../src/auth.js';

function mockReq(path, authorization) {
  return { path, headers: authorization ? { authorization } : {} };
}
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

describe('createAuth(Basic Auth)', () => {
  it('用户名或密码缺失 → 返回 null(不启用鉴权,本地零影响)', () => {
    expect(createAuth(undefined, 'x')).toBeNull();
    expect(createAuth('x', undefined)).toBeNull();
    expect(createAuth('', '')).toBeNull();
  });

  it('启用后无凭据:401 + WWW-Authenticate,不调 next', () => {
    const mw = createAuth('tom', 's3cret');
    const res = mockRes();
    const next = vi.fn();
    mw(mockReq('/api/account'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toMatch(/^Basic/);
    expect(res.body).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('错误用户名/错误密码:401', () => {
    const mw = createAuth('tom', 's3cret');
    for (const auth of [basic('tom', 'wrong'), basic('jerry', 's3cret'), 'Basic not-base64!!']) {
      const res = mockRes();
      mw(mockReq('/api/orders', auth), res, vi.fn());
      expect(res.statusCode).toBe(401);
    }
  });

  it('正确凭据:放行到 next', () => {
    const mw = createAuth('tom', 's3cret');
    const next = vi.fn();
    mw(mockReq('/', basic('tom', 's3cret')), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('凭据大小写敏感(密码 s3cret ≠ S3CRET)', () => {
    const mw = createAuth('tom', 's3cret');
    const res = mockRes();
    mw(mockReq('/', basic('tom', 'S3CRET')), res, vi.fn());
    expect(res.statusCode).toBe(401);
  });

  it('白名单 /api/meta/status 无凭据放行(容器健康检查)', () => {
    const mw = createAuth('tom', 's3cret');
    const next = vi.fn();
    mw(mockReq('/api/meta/status'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
