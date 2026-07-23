'use strict';

const MAX_MESSAGE_LENGTH = 4000;
const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*[^\s,;]+/gi,
  /bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /(token|secret|password|api[_-]?key|cookie|connection[_-]?string)\s*[:=]\s*[^\s,;]+/gi,
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /postgres(?:ql)?:\/\/[^\s]+/gi,
];

function redactText(value) {
  let text = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  if (text.length > MAX_MESSAGE_LENGTH) text = `${text.slice(0, MAX_MESSAGE_LENGTH)}…[TRUNCATED]`;
  return text;
}

function serializeLogEvent(event = {}) {
  const payload = event.payload || {};
  return {
    id: event.id || payload.id || null,
    deploymentId: payload.deploymentId || null,
    timestamp: event.created || payload.created || payload.date || null,
    level: event.type === 'stderr' || payload.statusCode >= 500 ? 'error' : event.type || 'info',
    source: event.type || payload.info?.type || null,
    message: redactText(payload.text || payload.message || ''),
    requestId: payload.requestId || null,
    statusCode: payload.statusCode || payload.proxy?.statusCode || null,
  };
}

module.exports = { redactText, serializeLogEvent, MAX_MESSAGE_LENGTH };
