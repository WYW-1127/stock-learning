// SSE 流解析单测 — consumeSseStream(delta 分流/tool_calls 分片拼装/脏行容错)
// 不发真实网络:用 async generator 伪造 SSE 字节流分片
import { describe, it, expect } from 'vitest';
import { consumeSseStream } from '../src/ai/llm.js';

// 把若干 SSE data 行打包成 chunk,模拟网络分片(fetch res.body 产出的是字节,行可被从中间切开)
const encoder = new TextEncoder();
async function* fakeBody(chunks) {
  for (const c of chunks) yield encoder.encode(c);
}

const line = (obj) => `data: ${JSON.stringify(obj)}\n`;

describe('consumeSseStream', () => {
  it('思考增量与内容增量分流回调,content 拼装完整', async () => {
    const deltas = [];
    const msg = await consumeSseStream(
      fakeBody([
        line({ choices: [{ delta: { reasoning_content: '用户问的是' } }] }),
        line({ choices: [{ delta: { reasoning_content: '平安银行' } }] }),
        line({ choices: [{ delta: { content: '{"intent"' } }] }),
        line({ choices: [{ delta: { content: ':"qa"}' } }] }),
        'data: [DONE]\n',
      ]),
      (d) => deltas.push(d),
    );
    expect(msg.content).toBe('{"intent":"qa"}');
    expect(msg.tool_calls).toBeUndefined();
    expect(deltas.filter((d) => d.reasoning).map((d) => d.reasoning).join('')).toBe('用户问的是平安银行');
    expect(deltas.filter((d) => d.content).map((d) => d.content).join('')).toBe('{"intent":"qa"}');
  });

  it('tool_calls 跨分片按 index 拼装(arguments 分片追加)', async () => {
    const msg = await consumeSseStream(
      fakeBody([
        line({ choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'get_stock_', arguments: '' } }] } }] }),
        line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: '', arguments: '{"sym' } }] } }] }),
        line({ choices: [{ delta: { tool_calls: [{ index: 1, id: 't2', function: { name: 'get_market_context', arguments: '{}' } }] } }] }),
        line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'bol":"sz000001"}' } }] } }] }),
        line({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      ]),
    );
    expect(msg.tool_calls).toHaveLength(2);
    // 流式分片不带 type,拼装时必须补上(否则回传 API 报 1214"工具类型不能为空")
    expect(msg.tool_calls[0]).toEqual({
      id: 't1', type: 'function', function: { name: 'get_stock_', arguments: '{"symbol":"sz000001"}' },
    });
    expect(msg.tool_calls[1].function.arguments).toBe('{}');
  });

  it('坏 JSON 行与非 data 行跳过,不抛异常', async () => {
    const msg = await consumeSseStream(
      fakeBody([': ping\n\n', 'data: {坏json\n', line({ choices: [{ delta: { content: 'ok' } }] }), '\n']),
    );
    expect(msg.content).toBe('ok');
  });
});
