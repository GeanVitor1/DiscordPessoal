const sensitive = /token|password|credential|cookie|authorization|secret|sdp|candidate|payload/i;
export function redact(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => redact(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [key, sensitive.test(key) ? '[redacted]' : redact(item, depth + 1)]));
  return typeof value === 'string' ? value.slice(0, 2000) : value;
}
