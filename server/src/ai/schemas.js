// 输出 Schema — 从 LLM 最终文本提取 JSON + 校验/规范化
// 容错:markdown 围栏剥离、前后杂文截取、字段钳制;校验失败返回 { valid:false, errors } 供 agent 修复重试

const INTENTS = ['general_analysis', 'buy_analysis', 'sell_analysis', 'position_analysis', 'add_position', 'reduce_position', 'risk_analysis', 'market_query', 'qa', 'fallback'];
const DECISIONS = ['buy', 'sell', 'hold', 'watch', 'split_sell', 'none'];
const CONFIDENCES = ['high', 'medium', 'low'];

// 从任意文本中提取最外层 JSON 对象(容忍 ```json 围栏与前后说明文字)
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

const asStringArray = (v) => {
  if (!Array.isArray(v)) return undefined;
  const arr = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 6);
  return arr;
};

/**
 * 校验并规范化 reply
 * @returns { valid:true, reply } | { valid:false, errors: [人话错误] }
 */
export function validateReply(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['输出不是 JSON 对象'] };

  const intent = INTENTS.includes(raw.intent) ? raw.intent : null;
  if (!intent) errors.push(`intent 必须是 ${INTENTS.join('|')} 之一`);

  const decision = DECISIONS.includes(raw.decision) ? raw.decision : null;
  if (!decision) errors.push(`decision 必须是 ${DECISIONS.join('|')} 之一`);

  let confidence = CONFIDENCES.includes(raw.confidence) ? raw.confidence : null;
  if (!confidence) {
    errors.push(`confidence 必须是 ${CONFIDENCES.join('|')} 之一`);
  }

  const stanceText = typeof raw.stanceText === 'string' && raw.stanceText.trim() ? raw.stanceText.trim() : null;
  if (!stanceText) errors.push('stanceText 必填(一句话人话综合判断)');

  const suggestion = typeof raw.suggestion === 'string' && raw.suggestion.trim() ? raw.suggestion.trim() : null;
  if (!suggestion) errors.push('suggestion 必填(给新手的下一步建议)');

  if (errors.length) return { valid: false, errors };

  // 通过后规范化:可选字段缺省补空,未知字段丢弃
  const reply = {
    intent,
    symbol: typeof raw.symbol === 'string' && /^[a-z]{2}\d{6}$/.test(raw.symbol) ? raw.symbol : null,
    decision,
    stanceText,
    confidence,
    facts: raw.facts && typeof raw.facts === 'object' && !Array.isArray(raw.facts) ? raw.facts : {},
    analysis: {
      trend: ['bullish', 'bearish', 'neutral'].includes(raw.analysis?.trend) ? raw.analysis.trend : null,
      technical: typeof raw.analysis?.technical === 'string' ? raw.analysis.technical : '',
    },
    reasons: asStringArray(raw.reasons) || [],
    risks: asStringArray(raw.risks) || [],
    coachQuestions: asStringArray(raw.coachQuestions) || [],
    suggestion,
  };
  return { valid: true, reply };
}

// 降级结构:LLM 彻底失败时保证用户仍能收到人话回复
export function fallbackReply(text, note) {
  return {
    intent: 'fallback',
    symbol: null,
    decision: 'none',
    stanceText: 'AI 分析暂时不可用',
    confidence: 'low',
    facts: {},
    analysis: { trend: null, technical: '' },
    reasons: [],
    risks: [],
    coachQuestions: [],
    suggestion: typeof text === 'string' && text.trim() ? text.trim().slice(0, 500) : (note || '请稍后再试。'),
  };
}
